-- Reviewer identity remains internal. Public mission data never contains a reviewer name.
ALTER TABLE public.missions DROP COLUMN IF EXISTS reviewer_wallet;
ALTER TABLE public.missions
  ALTER COLUMN review_by SET DEFAULT (now() + interval '7 days'),
  ADD COLUMN IF NOT EXISTS appeal_tx_signature text,
  ADD COLUMN IF NOT EXISTS appealed_at timestamptz;
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_settlement_status_check;
ALTER TABLE public.missions ADD CONSTRAINT missions_settlement_status_check
  CHECK (settlement_status IS NULL OR settlement_status IN ('Paid', 'Rejected', 'RejectedPendingAppeal', 'RejectedFinal', 'Appealed', 'Escalated', 'Refunded'));

-- One pending enrollment per Atlas account and one approved enrollment per wallet.
CREATE TABLE public.reviewer_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address text NOT NULL UNIQUE CHECK (char_length(wallet_address) BETWEEN 32 AND 60),
  pseudonym text NOT NULL CHECK (char_length(btrim(pseudonym)) BETWEEN 2 AND 40),
  conflict_attested boolean NOT NULL DEFAULT false CHECK (conflict_attested),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paused', 'rejected')),
  last_assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
ALTER TABLE public.reviewer_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reviewer_enrollments FROM anon, authenticated;
GRANT SELECT, INSERT ON public.reviewer_enrollments TO authenticated;
GRANT ALL ON public.reviewer_enrollments TO service_role;
CREATE POLICY "reviewers can see their own enrollment" ON public.reviewer_enrollments
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "users can request reviewer enrollment" ON public.reviewer_enrollments
  FOR INSERT TO authenticated WITH CHECK (
    (select auth.uid()) = user_id AND status = 'pending' AND conflict_attested
  );

-- Assignment details are private to the assigned reviewer and trusted server code.
CREATE TABLE public.mission_review_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  reviewer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_wallet text NOT NULL CHECK (char_length(reviewer_wallet) BETWEEN 32 AND 60),
  review_round smallint NOT NULL CHECK (review_round BETWEEN 0 AND 2),
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'accepted', 'decided', 'timed_out', 'escalated')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  deadline timestamptz NOT NULL,
  accepted_at timestamptz,
  decided_at timestamptz,
  decision text CHECK (decision IN ('approved', 'rejected')),
  tx_signature text,
  UNIQUE (mission_id, review_round)
);
CREATE INDEX mission_review_assignments_reviewer_idx
  ON public.mission_review_assignments (reviewer_user_id, status, deadline);
CREATE INDEX mission_review_assignments_mission_idx
  ON public.mission_review_assignments (mission_id, review_round DESC);
ALTER TABLE public.mission_review_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mission_review_assignments FROM anon, authenticated;
GRANT SELECT ON public.mission_review_assignments TO authenticated;
GRANT ALL ON public.mission_review_assignments TO service_role;
CREATE POLICY "reviewers can see only their own assignments" ON public.mission_review_assignments
  FOR SELECT TO authenticated USING ((select auth.uid()) = reviewer_user_id);

CREATE POLICY "assigned reviewers can read mission evidence" ON public.mission_submissions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.mission_review_assignments AS a
    WHERE a.mission_id = mission_submissions.mission_id
      AND a.reviewer_user_id = (select auth.uid())
  ));
CREATE POLICY "assigned reviewers can open mission evidence photos" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'mission-evidence' AND EXISTS (
      SELECT 1 FROM public.mission_review_assignments AS a
      JOIN public.mission_submissions AS s ON s.mission_id = a.mission_id
      WHERE s.photo_path = name AND a.reviewer_user_id = (select auth.uid())
    )
  );

-- Called only by the server's service-role client. Row locking makes the least-recently
-- assigned rotation safe when two submissions arrive at the same time.
CREATE OR REPLACE FUNCTION public.claim_next_mission_reviewer(excluded_wallets text[])
RETURNS TABLE (reviewer_user_id uuid, wallet_address text, pseudonym text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE selected public.reviewer_enrollments%ROWTYPE;
BEGIN
  SELECT e.* INTO selected
  FROM public.reviewer_enrollments AS e
  WHERE e.status = 'approved'
    AND e.conflict_attested
    AND NOT (e.wallet_address = ANY (excluded_wallets))
  ORDER BY e.last_assigned_at ASC NULLS FIRST, e.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.reviewer_enrollments AS e
    SET last_assigned_at = pg_catalog.now()
    WHERE e.id = selected.id;

  RETURN QUERY SELECT selected.user_id, selected.wallet_address, selected.pseudonym;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_next_mission_reviewer(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_mission_reviewer(text[]) TO service_role;

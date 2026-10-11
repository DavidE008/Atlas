-- Pilot reviewer approvals record the operator's trusted-invite basis.
ALTER TABLE public.reviewer_enrollments
  ADD COLUMN reviewed_by_wallet text,
  ADD COLUMN approval_basis text;

ALTER TABLE public.reviewer_enrollments
  ADD CONSTRAINT reviewer_enrollments_reviewed_by_wallet_check
    CHECK (reviewed_by_wallet IS NULL OR char_length(reviewed_by_wallet) BETWEEN 32 AND 60),
  ADD CONSTRAINT reviewer_enrollments_approval_basis_check
    CHECK (approval_basis IS NULL OR approval_basis = 'pilot_trusted_invite'),
  ADD CONSTRAINT reviewer_enrollments_approval_audit_pair_check
    CHECK ((reviewed_by_wallet IS NULL) = (approval_basis IS NULL));

COMMENT ON COLUMN public.reviewer_enrollments.reviewed_by_wallet IS
  'Wallet that signed the operator approval for this reviewer enrollment.';
COMMENT ON COLUMN public.reviewer_enrollments.approval_basis IS
  'Pilot approval basis; this records trusted invitation/personal familiarity, not expertise certification.';

-- Uniform random selection among currently eligible reviewers. FOR UPDATE SKIP LOCKED
-- reserves a different reviewer when simultaneous submissions claim from the same pool.
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
    AND NOT (e.wallet_address = ANY (COALESCE(excluded_wallets, ARRAY[]::text[])))
  ORDER BY pg_catalog.random()
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

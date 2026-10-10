CREATE TABLE public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mission_key text NOT NULL UNIQUE CHECK (mission_key ~ '^[0-9a-f]{32}$'),
  sponsor_wallet text NOT NULL,
  reviewer_wallet text NOT NULL,
  program_address text NOT NULL,
  mission_address text,
  terms_hash text,
  title text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 100),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  category text NOT NULL DEFAULT 'cleanup' CHECK (category IN ('cleanup')),
  neighborhood text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  reward_lamports bigint NOT NULL CHECK (reward_lamports > 0),
  submit_by timestamptz NOT NULL,
  review_by timestamptz NOT NULL,
  settlement_status text CHECK (settlement_status IN ('Paid', 'Rejected', 'Refunded')),
  settlement_tx_signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (review_by > submit_by)
);
CREATE INDEX missions_created_at_idx ON public.missions (created_at DESC);
CREATE INDEX missions_mission_address_idx ON public.missions (mission_address) WHERE mission_address IS NOT NULL;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.missions TO anon, authenticated;
GRANT INSERT ON public.missions TO authenticated;
GRANT UPDATE (mission_address, terms_hash, settlement_status, settlement_tx_signature) ON public.missions TO authenticated;
CREATE POLICY "published missions are public" ON public.missions
  FOR SELECT TO anon, authenticated USING (mission_address IS NOT NULL);
CREATE POLICY "owners can read their drafts" ON public.missions
  FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "users create their own missions" ON public.missions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by AND mission_address IS NULL);
CREATE POLICY "owners may publish drafts" ON public.missions
  FOR UPDATE TO authenticated USING (auth.uid() = created_by AND mission_address IS NULL)
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "owners can record settlement receipts" ON public.missions
  FOR UPDATE TO authenticated USING (auth.uid() = created_by AND mission_address IS NOT NULL)
  WITH CHECK (auth.uid() = created_by AND mission_address IS NOT NULL);

CREATE TABLE public.mission_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_wallet text NOT NULL,
  note text NOT NULL CHECK (char_length(note) BETWEEN 3 AND 1000),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  photo_path text,
  tx_signature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id)
);
CREATE INDEX mission_submissions_mission_idx ON public.mission_submissions (mission_id);
ALTER TABLE public.mission_submissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.mission_submissions TO authenticated;
CREATE POLICY "participants and mission creators can read submissions" ON public.mission_submissions
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM public.missions m WHERE m.id = mission_id AND m.created_by = auth.uid()
    )
  );
CREATE POLICY "participants may add their own submission" ON public.mission_submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mission-evidence', 'mission-evidence', false, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "participants and mission creators can read mission evidence" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'mission-evidence' AND EXISTS (
      SELECT 1 FROM public.mission_submissions s
      JOIN public.missions m ON m.id = s.mission_id
      WHERE s.photo_path = name AND (s.user_id = auth.uid() OR m.created_by = auth.uid())
    )
  );
CREATE POLICY "participants upload evidence to their folder" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'mission-evidence' AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users upload photos to own folder" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "signed-in users can view report photos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'report-photos');

CREATE POLICY "users delete own photos" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
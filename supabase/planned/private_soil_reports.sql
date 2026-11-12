-- DRAFT ONLY: do not execute until a private bucket named
-- "terrawise-soil-reports" has been created in the Dashboard, all existing
-- Storage policies have been reviewed, and the upload/consent UI is ready.
-- Policies are permissive and combine with OR: unrelated broad policies can
-- still expose objects. This draft deliberately changes no existing policies.
--
-- Future object path: <authenticated-user-uuid>/<opaque-generated-file-id>
-- The authenticated client must never place a farmer's name in the object path.

create policy "terrawise_soil_reports_owner_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'terrawise-soil-reports'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "terrawise_soil_reports_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'terrawise-soil-reports'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- No update or delete policy is supplied. Design and test those operations
-- before enabling replacement or deletion. Do not grant public access.

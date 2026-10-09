-- Les politiques d’accès privé existantes restent inchangées.
update storage.buckets set file_size_limit = 524288000 where id = 'lcs-private';

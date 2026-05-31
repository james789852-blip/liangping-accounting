-- 移除影片容量限制（約 10 分鐘影片約 500MB~2GB）
update storage.buckets set file_size_limit = null where id = 'menu-videos';

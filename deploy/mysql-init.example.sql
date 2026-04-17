-- Run as MySQL root (or admin) once on the server. Replace passwords and host access as needed.
-- Do not commit real passwords.

CREATE DATABASE IF NOT EXISTS pli_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Application user (example — use your own strong password)
CREATE USER IF NOT EXISTS 'pli_app'@'localhost' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON pli_portal.* TO 'pli_app'@'localhost';
FLUSH PRIVILEGES;

-- If Node runs on another host, also grant for that host, e.g.:
-- CREATE USER IF NOT EXISTS 'pli_app'@'10.26.1.%' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';
-- GRANT ALL PRIVILEGES ON pli_portal.* TO 'pli_app'@'10.26.1.%';
-- FLUSH PRIVILEGES;

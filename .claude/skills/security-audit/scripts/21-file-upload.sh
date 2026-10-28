#!/usr/bin/env bash
# Rule 21 [S]: File Upload Defense — MIME/type validation + metadata sanitization.
. "$(dirname "$0")/_lib.sh"
RULE_ID=21; RULE_NAME="File Upload Defense"; RULE_TAGS="S"
header
empty_repo_note

violations=0
upload_found=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "(multer|formidable|busboy|@nestjs/platform-express.*FileInterceptor|fastapi.*UploadFile|werkzeug.*FileStorage)" "$f" 2>/dev/null; then
    upload_found=1
    if ! grep -qE "(fileFilter|mimetype|content_type|file-type|magic-bytes|sharp\(|exiftool|exifremove|sanitize|allowedTypes|ALLOWED_MIME)" "$f" 2>/dev/null; then
      fail "$f handles uploads without visible MIME/type validation or metadata strip"
      violations=$((violations + 1))
    fi
  fi
done < <(find_files ts js py)

[ "$upload_found" -eq 0 ] && info "no file-upload handler detected yet"
[ "$violations" -eq 0 ] && [ "$upload_found" -gt 0 ] && pass "upload handlers validate type / strip metadata"
finish

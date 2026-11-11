// Files dropped on the editor from Explorer or Finder (the server's upload.ts, the editor's api.ts upload functions).

/** a dropped file as the page knows it: its name, size in bytes and modified time (the browser's lastModified, ms) */
export interface UploadFile { name: string; size: number; mtime: number }
/** POST /api/projects/:id/upload/check */
export interface UploadCheckRequest { files: UploadFile[] }
/** each file's path in the project when it has it already (absolute), else null; in the request's order */
export interface UploadCheckResult { found: Array<string | null> }
/** PUT /api/projects/:id/upload?name=…&mtime=… (the body is the file's bytes): where it was written (absolute) */
export interface UploadResult { path: string }

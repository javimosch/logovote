# Src Directory Knowledge

This directory holds the server-side logic (`server.js`) and the client-side HTML files (`index.html`, `superadmin.html`).

## Files

- `server.js`: The main backend server file (Express application).
    - Uses `dotenv` to load environment variables from the root `.env` file.
    - Uses `express-basic-auth` to protect `/superadmin` route and API endpoints.
    - Handles API requests for:
        - Serving the main voting HTML page (`GET /` -> `index.html`).
        - Serving the superadmin HTML page (`GET /superadmin` -> `superadmin.html`, requires Basic Auth).
        - Namespace creation (`POST /namespace`).
        - Logo retrieval (`GET /logos`).
        - Logo upload (`POST /upload`) using `multer`.
        - Voting (`POST /vote`).
        - Namespace-specific admin functions (`DELETE /logo`, `POST /clear-votes`, `DELETE /namespace`) requiring `adminKey`.
        - Superadmin API functions (`GET /superadmin/namespaces`, `DELETE /superadmin/namespace/:id`, `DELETE /superadmin/namespaces/all`, `DELETE /superadmin/namespaces/empty`) requiring Basic Auth.
    - Manages data persistence by reading/writing JSON files in `../data/namespaces/`.
    - Manages uploaded files in `../data/uploads/`.
    - Includes helper functions for data I/O, validation, and file deletion (`readNamespaceData`, `writeNamespaceData`, `validateAdminKey`, `deleteNamespaceFiles`).
    - Includes a `node-cron` job to prune old, empty namespaces daily.
- `index.html`: The main HTML file served to the client for voting.
    - Uses Tailwind CSS and vanilla JavaScript.
    - Interacts with the backend API to display logos, handle uploads, voting, and namespace creation/admin actions.
    - Stores user identifier (for voting uniqueness) in `localStorage`, scoped by namespace.
- `superadmin.html`: The HTML interface for superadmin functions.
    - Served at `/superadmin` (requires Basic Auth).
    - Uses Tailwind CSS and vanilla JavaScript.
    - Interacts with the `/superadmin/*` API endpoints to list and delete namespaces.

## Data Handling

- Data is stored per "namespace" in JSON files within the `../data/namespaces/` directory.
- Uploaded logos are stored in subdirectories within `../data/uploads/`, named after the namespace ID.
- The server ensures the `../data/namespaces` and `../data/uploads` directories exist on startup.
- The `deleteNamespaceFiles` function handles removing both the JSON file and the corresponding upload directory for a namespace.

## Superadmin

- Access to `/superadmin` (UI) and `/superadmin/*` (API) requires Basic Authentication credentials set in the root `.env` file (`SUPERADMIN_USER`, `SUPERADMIN_PASSWORD`).
- Provides a web interface (`superadmin.html`) and API endpoints for listing and deleting namespaces globally.
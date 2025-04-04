# Logovote Project Knowledge

## Overview

This project is a simple voting application called "Logovote". Users can vote on logos within different namespaces. It also includes a superadmin interface for managing namespaces and data.

## Tech Stack

- Backend: Node.js (using Bun runtime), Express
- Frontend: HTML, Tailwind CSS, vanilla JavaScript
- Data Storage: Filesystem (JSON files in `app/data/`)
- Containerization: Docker
- Authentication: Basic Auth (for superadmin)
- Dependencies: `express`, `multer`, `uuid`, `node-cron`, `express-basic-auth`, `dotenv`, `archiver`, `unzipper`

## Running the Project

1.  **Create `.env` file:** In the project root, create a `.env` file with the following content:
    ```dotenv
    # Superadmin Credentials
    SUPERADMIN_USER=your_desired_username
    SUPERADMIN_PASSWORD=your_strong_password
    ```
2.  **Run with Docker Compose:**
    ```bash
    docker-compose up --build
    ```

## Key Directories

- `app/`: Contains the application code (server and client).
- `app/data/`: Stores voting data (`namespaces/`) and uploaded logos (`uploads/`) (mounted via Docker volume).
- `.env`: Stores environment variables like superadmin credentials (ensure this is in `.gitignore`).

## Key Endpoints

- `/`: Serves the main voting application (`app/src/index.html`).
- `/namespace`: (POST) Create a new voting namespace.
- `/logos`: (GET) Get logos for a specific namespace.
- `/upload`: (POST) Upload a logo to a namespace.
- `/vote`: (POST) Record a vote for a logo.
- `/logo`: (DELETE) Delete a specific logo (requires namespace admin key).
- `/clear-votes`: (POST) Clear all votes in a namespace (requires namespace admin key).
- `/namespace`: (DELETE) Delete an entire namespace (requires namespace admin key).
- `/namespace/friendly-url`: (POST) Set a friendly URL name for a namespace (requires admin key).
- `/logo/description`: (POST) Set the description for a logo (requires admin key).
- `/v/:friendlyUrlName`: (GET) Redirects to a namespace via its friendly URL.
- `/superadmin/*`: Endpoints for overall namespace management (requires Basic Auth defined in `.env`).
    - `GET /superadmin`: Serves the superadmin UI (`superadmin.html`).
    - `GET /superadmin/namespaces`: List all namespaces.
    - `DELETE /superadmin/namespace/:id`: Delete a specific namespace.
    - `DELETE /superadmin/namespaces/all`: Delete all namespaces.
    - `DELETE /superadmin/namespaces/empty`: Delete namespaces with zero votes.
    - `GET /superadmin/export`: Downloads a zip archive of all `data/namespaces` and `data/uploads`.
    - `POST /superadmin/import`: Uploads a zip archive to replace existing data (clears existing data first).
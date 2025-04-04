# Logo Voting Tool - Implementation & Setup

This document outlines the structure and setup for the Logo Voting Tool.

## Project Structure
- logo-voting-tool/
  - `frontend/`
    - `index.html`         # Main frontend with Tailwind CSS and vanilla JS
  - `backend/`
    - `server.js`         # Node.js/Express server
    - `package.json`      # Node dependencies
    - `node_modules/`     # (Generated)
  - `data/`               # **Persisted via Docker volume**
    - `namespaces/`       # Directory for per-namespace JSON files (e.g., `[namespace-id].json`)
    - `uploads/`          # Directory for uploaded logo files, namespaced by ID (e.g., `[namespace-id]/[filename]`)
  - `Dockerfile`          # Docker configuration
  - `docker-compose.yml`  # Docker Compose setup
  - `plan.md`             # This file

## Features Implemented
- **Vote Namespaces**:
  - Users can create a new vote-namespace via the frontend.
  - Generates a unique ID, a public voting link (`http://localhost:3000/?namespace=[id]`), and an admin link with a key (`http://localhost:3000/?namespace=[id]&admin=[admin-key]`).
  - Frontend displays these links upon creation.
  - Users interact with one namespace at a time via the `?namespace=[id]` URL parameter.
- **Logo Upload**:
  - Frontend allows uploading SVG, JPG, PNG files (backend enforces type and 5MB size limit).
  - Uploads are saved to the active namespace's specific folder within `/data/uploads/`.
- **Logo Display**:
  - Frontend displays a grid of uploaded logos with current vote counts for the active namespace.
- **Voting**:
  - On the first vote within a namespace, the user is prompted for a unique identifier (email or phone).
  - Frontend displays the message: "Please provide a unique identifier (e.g., email or phone number). We only use this to count votes and ensure one vote per logo within this namespace. It is stored securely."
  - Identifier is Base64-encoded and stored in `localStorage` scoped to the namespace (key: `namespace-[id]-identifier`).
  - Backend prevents voting more than once per identifier per logo within the namespace.
- **Admin Functionality**:
  - Access admin features by visiting the admin link (`?namespace=[id]&admin=[key]`).
  - Frontend shows admin controls (Delete Logo, Clear Votes, Delete Namespace) if the admin key is present in the URL.
  - Backend validates the admin key for all admin actions.
    - Delete a specific logo from the namespace.
    - Clear all votes for all logos in the namespace.
    - Delete the entire namespace (JSON file and associated upload directory).
- **Persistence**:
  - Namespace metadata (logos, votes, admin key) stored in `/data/namespaces/[namespace-id].json`.
  - Uploaded logo files stored in `/data/uploads/[namespace-id]/[filename]`.
  - The `/data` directory is mounted as a Docker volume, ensuring data persists across container restarts.

## Data Schema (`/data/namespaces/[namespace-id].json`)
```json
{
  "adminKey": "unique-admin-key-uuid",
  "logos": [
    {
      "id": "unique-logo-id-uuid",
      "path": "namespace-id/unique-filename.png", // Path relative to /data/uploads/
      "votes": [
        "base64-encoded-identifier-1",
        "base64-encoded-identifier-2"
        // ...
      ]
    }
    // ... more logo objects
  ]
}
```

## Setup and Run Instructions

1.  **Prerequisites**:
    *   Docker and Docker Compose installed.

2.  **Clone/Download Project**:
    *   Ensure you have all the project files (`frontend/`, `backend/`, `data/`, `Dockerfile`, `docker-compose.yml`, `plan.md`). The `data/` directory can be initially empty; the application and Docker setup will create necessary subdirectories (`namespaces`, `uploads`).

3.  **Build and Run with Docker Compose**:
    *   Open a terminal in the project's root directory (where `docker-compose.yml` is located).
    *   Run the command:
        ```bash
        docker-compose up --build -d
        ```
        *   `--build`: Builds the Docker image based on the `Dockerfile`. Only needed the first time or if you change `Dockerfile` or backend dependencies.
        *   `-d`: Runs the container in detached mode (in the background).

4.  **Access the Application**:
    *   Open your web browser and navigate to `http://localhost:3000`.

5.  **Using the App**:
    *   Click "Create New Vote Namespace".
    *   Copy the generated Voting and Admin links. **Save the Admin link securely!**
    *   Use the Voting link to view, upload, and vote.
    *   Use the Admin link to access administrative functions (delete logos, clear votes, delete namespace).

6.  **Stopping the Application**:
    *   To stop the running containers, run the following command in the project's root directory:
        ```bash
        docker-compose down
        ```
        *   This stops and removes the containers. Your data in the `./data` directory will persist because of the volume mount.

## Notes
- **Security**:
  - File type/size validation is present on the backend.
  - Base64 encoding of the identifier is trivial to decode; it's for uniqueness tracking, not strong security/anonymity.
  - The admin key in the URL is the *only* protection for admin actions. Anyone with the link has full control over that namespace. Suitable for trusted groups or low-stakes voting.
- **Data Persistence**: The `./data` directory on your host machine holds all namespace information and uploaded files. Back this up if the data is important.
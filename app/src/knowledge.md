# Src Directory Knowledge

This directory holds the server-side logic and the client-side HTML.

## Files

- `server.js`: The main backend server file.
    - Uses Node.js `http` module to create a server.
    - Handles API requests for:
        - Serving the main HTML page (`/`).
        - Getting vote data (`/api/votes?namespace=...`).
        - Submitting votes (`/api/vote?namespace=...&logo=...`).
        - Admin functions (requires `adminKey`).
    - Manages data persistence by reading/writing JSON files in `../data/`.
    - Includes functions for data validation and directory management.
- `index.html`: The main HTML file served to the client.
    - Contains the user interface for viewing logos and voting.
    - Likely uses JavaScript to interact with the backend API.

## Data Handling

- Data is stored per "namespace" in JSON files within the `../data/` directory (relative to `server.js`).
- Each namespace file (e.g., `../data/myNamespace.json`) stores an object mapping logo names to vote counts.
- The server ensures the `../data/` directory exists on startup.
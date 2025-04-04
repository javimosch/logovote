# LogoVote Tool 🗳️

A simple web application for creating namespaces where users can upload logos and vote on their favorites. Features include admin controls, friendly URLs, multiple file uploads, logo descriptions, and a superadmin interface for management.

Created for [enbauges.fr](https://enbauges.fr) 🏔️

## Features ✨

*   **Namespace Creation:** Generate unique spaces for voting sessions.
*   **Logo Upload:** Admins can upload multiple logos (SVG, JPG, PNG).
*   **Voting:** Users vote for logos using a unique identifier (stored locally).
*   **Admin Controls:** Namespace creators get an admin link to manage logos, clear votes, set friendly URLs, and delete the namespace.
*   **Friendly URLs:** Set easy-to-share `/v/your-name` links for namespaces.
*   **Logo Descriptions:** Admins can add descriptions to logos.
*   **Superadmin Panel:** (Optional, requires `.env` setup) A `/superadmin` route for managing all namespaces, including bulk deletion, export, and import.
*   **i18n Support:** Basic internationalization for English (en) and French (fr).

## Running the Application 🚀

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm (usually comes with Node.js)

### Local Development

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd logovote
    ```
2.  **Install dependencies:**
    ```bash
    cd app
    npm install
    cd ..
    ```
3.  **(Optional) Configure Superadmin:**
    *   Create a file named `.env` inside the `app/` directory.
    *   Add the following lines, replacing `<your_user>` and `<your_password>` with secure credentials:
        ```dotenv
        SUPERADMIN_USER=<your_user>
        SUPERADMIN_PASSWORD=<your_password>
        ```
4.  **Run the development server:**
    ```bash
    cd app
    npm run dev
    ```
    This will start the server using `nodemon`, which automatically restarts when files change. The application will be available at `http://localhost:3000`.

### Production (using Docker)

1.  **Build the Docker image:**
    ```bash
    docker build -t logovote .
    ```
2.  **(Optional) Configure Superadmin via `.env`:**
    *   Ensure the `app/.env` file exists as described in the local development steps. The `docker-compose.yml` file is configured to load this.
3.  **Run using Docker Compose:**
    ```bash
    docker-compose up -d
    ```
    This will build the image if it doesn't exist, create a persistent volume for data, load the `.env` file, and run the container in the background. The application will be available at `http://localhost:3000` (or the port mapped in `docker-compose.yml`).

    *   To view logs: `docker-compose logs -f`
    *   To stop: `docker-compose down`

## Data Storage 💾

*   Namespace metadata and vote identifiers are stored in JSON files within `./app/data/namespaces`.
*   Uploaded logos are stored in subdirectories within `./app/data/uploads`.
*   When using Docker Compose, this data is persisted in a Docker volume named `logovote_data` (or similar, based on the project directory name).

## Contributing 🙏

Contributions, issues, and feature requests are welcome!
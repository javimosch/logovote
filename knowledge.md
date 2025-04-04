# Logovote Project Knowledge

## Overview

This project is a simple voting application called "Logovote". Users can vote on logos within different namespaces.

## Tech Stack

- Backend: Node.js (using Bun runtime)
- Frontend: HTML, potentially vanilla JavaScript
- Data Storage: Filesystem (JSON files in `app/data/`)
- Containerization: Docker

## Running the Project

Use Docker Compose:

```bash
docker-compose up --build
```

## Key Directories

- `app/`: Contains the application code (server and client).
- `app/data/`: Stores voting data for each namespace.
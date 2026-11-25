# Sthyra Studios — project management

Internal project management for Sthyra Studios, based on
[OpenProject](https://github.com/opf/openproject) (GPLv3), rebranded, with all
Enterprise/subscription upsells removed and a Sthyra opening animation.

## Run it (Windows)
1. Install Git for Windows and Docker Desktop, and start Docker Desktop.
2. Download `Start-SthyraStudios.ps1` from this repo and run in PowerShell:

       powershell -ExecutionPolicy Bypass -File .\Start-SthyraStudios.ps1

   For the team on the office network: add `-HostName <this-PC-IP>:8080`.
3. Open http://localhost:8080 — first login `admin` / `admin`.

The first build takes 20–40 minutes. The script saves a secret key in
`%USERPROFILE%\sthyra-studios\.secret_key_base`; keep it, the database needs it.

## Linux / Mac
    docker build -f docker/prod/Dockerfile --target all-in-one -t sthyra-studios .
    docker run -d -p 8080:80 -e SECRET_KEY_BASE=$(openssl rand -hex 64) \
      -e OPENPROJECT_HOST__NAME=localhost:8080 -e OPENPROJECT_HTTPS=false \
      -v sthyra_pgdata:/var/openproject/pgdata -v sthyra_assets:/var/openproject/assets sthyra-studios

## Licence
GPLv3, inherited from OpenProject. OpenProject's copyright notices are kept in
the source. The previous contents of this repo are on branch `main-backup-2026-11-25`.

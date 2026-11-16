# MediMart

Your health, delivered. A lightweight offline-friendly pharmacy demo built with Flask, SQLite, plain HTML, CSS, and vanilla JavaScript. Prices are displayed in Kenyan Shillings (KSh).

## Quick start

1. Run `setup.bat` (Windows) or `./setup.sh` (macOS/Linux).
2. Run `run.bat` (Windows) or `./run.sh` (macOS/Linux).
3. Open `http://127.0.0.1:5000`.

The admin dashboard is at `http://127.0.0.1:5000/admin.html`. The default password is `admin123`.

Delete `config.db` to reset the database and reseed products on the next start. Change `name`, `tagline`, `primary`, `delivery_fee`, `admin_password`, and the seed `products` in `config.json` to rebrand or configure the demo. You can also run `python app.py path/to/config.json`; its SQLite database is created next to that config file. Set `PORT` to choose another port.

`vendor/` contains offline installation wheels when prepared on the target machine. If wheels for your operating system are not included, run `pip download -r requirements.txt -d vendor` while online before setup. No external network requests or assets are used at runtime.

## Render deployment

The simplest deployment is one Render web service: Flask serves the frontend and API, while SQLite is stored on a Render persistent disk. Do not split this demo into separate frontend, backend, and database services.

In Render, create a **Web Service** from this project and use:

- Build command: `pip install -r requirements.txt`
- Start command: `python app.py`
- Environment variable: `ADMIN_PASSWORD` with a strong private value
- Persistent disk: mount at `/opt/render/project/src/data`
- Environment variable: `MEDIMART_DB_PATH=/opt/render/project/src/data/medimart.db`

The SQLite database is created at `MEDIMART_DB_PATH` on the persistent disk. If that variable is not set, it is created beside the selected config file. The included `render.yaml` documents the service and disk setup.

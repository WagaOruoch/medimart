@echo off
python -m venv venv
call venv\Scripts\activate
python -m pip install --no-index --find-links=vendor -r requirements.txt
echo Setup complete. Run run.bat to start MediMart.


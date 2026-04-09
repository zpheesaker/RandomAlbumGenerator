@echo off
echo Generating sample data for the Random Album Generator...
powershell -ExecutionPolicy Bypass -File "%~dp0Code\GenerateSampleData.ps1"
echo.
echo Sample data generation complete! You can now run Launch.bat.
pause

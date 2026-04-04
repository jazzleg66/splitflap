@echo off
netsh advfirewall firewall add rule name="Digital Solari (port 3000)" dir=in action=allow protocol=TCP localport=3000
echo.
echo Done. Port 3000 is now open for inbound connections.
pause

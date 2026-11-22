$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Instala Python 3.10 o superior y vuelve a ejecutar este archivo.' }
}
& '.venv/Scripts/python.exe' -m pip install -r backend/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'La instalación no terminó. Revisa la conexión y los mensajes anteriores.' }
& (Join-Path $PSScriptRoot 'start-local.ps1')

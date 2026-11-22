$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$pythonExecutable = Join-Path $projectDirectory '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonExecutable)) {
    throw 'No se encontró el entorno Python. Ejecuta python -m venv .venv y después .venv\Scripts\python.exe -m pip install -r backend\requirements.txt desde la carpeta del proyecto.'
}
$alreadyRunning = $false
try {
    $capabilities = Invoke-RestMethod 'http://127.0.0.1:8877/api/capabilities' -TimeoutSec 2
    $alreadyRunning = $capabilities.python -eq $true -and $capabilities.local_only -eq $true
} catch { }
if (-not $alreadyRunning) {
    $runtimeDirectory = Join-Path $projectDirectory 'runtime'
    New-Item -ItemType Directory -Force $runtimeDirectory | Out-Null
    $process = Start-Process -FilePath $pythonExecutable -ArgumentList '-m','backend.server' -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory 'server.log') -RedirectStandardError (Join-Path $runtimeDirectory 'server-error.log')
    Set-Content -LiteralPath (Join-Path $runtimeDirectory 'server.pid') -Value $process.Id
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 300
        try {
            $capabilities = Invoke-RestMethod 'http://127.0.0.1:8877/api/capabilities' -TimeoutSec 1
            if ($capabilities.python) { $alreadyRunning=$true; break }
        } catch { }
    }
    if (-not $alreadyRunning) { throw 'El motor no arrancó. Consulta runtime/server-error.log.' }
}
Write-Output 'Plano Vivo Local está disponible en http://127.0.0.1:8877/'

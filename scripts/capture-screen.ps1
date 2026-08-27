# CLIMB screenshot hotkey script (Windows)
# Captures the entire virtual screen (all monitors) and saves it as PNG into
# data/inbox/, where CLIMB auto-registers it as an asset.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)

$inbox = Join-Path (Split-Path $PSScriptRoot -Parent) "data\inbox"
New-Item -ItemType Directory -Force -Path $inbox | Out-Null

$name = "{0}_screen.png" -f (Get-Date -Format "yyyy-MM-dd_HHmmss")
$bitmap.Save((Join-Path $inbox $name), [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bitmap.Dispose()

# Text in still images for Tellcut (toolkit phase 5), with Windows' built-in OCR (Windows.Media.Ocr; nothing to install).
#   powershell -NoProfile -ExecutionPolicy Bypass -File ocr.ps1 -List <file with one image path per line> [-Lang zh-Hant-TW]
# One JSON line per image: {"image","width","height","lines":[{"text","box":[x,y,w,h]}]} (pixels). Recognises caption-size
# text well; big stylised titles mostly not.
param([Parameter(Mandatory = $true)][string]$List, [string]$Lang = 'zh-Hant-TW')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }

$language = New-Object Windows.Globalization.Language $Lang
if (-not [Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($language)) { throw "這台電腦沒有 $Lang 的文字辨識（設定 → 時間與語言 → 語言，加入中文（台灣）並安裝「光學字元辨識」）" }
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
foreach ($path in [System.IO.File]::ReadAllLines($List, [System.Text.Encoding]::UTF8)) {
  if (-not $path.Trim()) { continue }
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    $lines = @(foreach ($l in $res.Lines) {
      $x0 = ($l.Words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
      $y0 = ($l.Words | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
      $x1 = ($l.Words | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
      $y1 = ($l.Words | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum
      [ordered]@{ text = $l.Text; box = @([math]::Round($x0), [math]::Round($y0), [math]::Round($x1 - $x0), [math]::Round($y1 - $y0)) }
    })
    [ordered]@{ image = $path; width = $bmp.PixelWidth; height = $bmp.PixelHeight; lines = $lines } | ConvertTo-Json -Compress -Depth 5
  } finally { $stream.Dispose() }
}

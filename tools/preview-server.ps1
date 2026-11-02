param([int]$Port = 4173)

$ErrorActionPreference = 'Stop'
$rootPath = [System.IO.Path]::GetFullPath((Get-Location).Path)
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)

$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
}

try {
  $listener.Start()
  Write-Host "FinanceApp preview: http://localhost:$Port/"
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }
      while ($reader.ReadLine()) { }
      $requestParts = $requestLine -split ' '
      if ($requestParts.Length -lt 2) { continue }
      $requestTarget = $requestParts[1]
      $requestPath = ([System.Uri]::new("http://localhost$requestTarget")).AbsolutePath
      $relativePath = [System.Uri]::UnescapeDataString($requestPath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }
      $requestedPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootPath, $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)))
      if ($requestedPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.Directory]::Exists($requestedPath)) {
        $requestedPath = [System.IO.Path]::Combine($requestedPath, 'index.html')
      }
      if (-not $requestedPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase) -or -not [System.IO.File]::Exists($requestedPath)) {
        $status = '404 Not Found'
        $contentType = 'text/plain; charset=utf-8'
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
      } else {
        $status = '200 OK'
        $extension = [System.IO.Path]::GetExtension($requestedPath).ToLowerInvariant()
        $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($requestedPath)
      }
      $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Flush()
    } catch {
      Write-Warning "Ignored malformed local request: $($_.Exception.Message)"
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}

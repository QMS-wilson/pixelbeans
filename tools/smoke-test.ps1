param(
  [int]$BackendPort = 9090,
  [int]$FrontendPort = 8789
)

# 冒烟测试：验证卡密后端与前端代理的关键路径。
# 注意：下载头测试会使用一张 active 卡密，测试前后会自动备份/恢复 cards.json。

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $PSScriptRoot
$store = Join-Path $root "card-backend\卡密\cards.json"
$backup = Join-Path $root "card-backend\卡密\cards.json.smoketest.bak"

Copy-Item -LiteralPath $store -Destination $backup -Force

$beOut = Join-Path $env:TEMP "be_smoke_out.log"
$beErr = Join-Path $env:TEMP "be_smoke_err.log"
$feOut = Join-Path $env:TEMP "fe_smoke_out.log"
$feErr = Join-Path $env:TEMP "fe_smoke_err.log"

$env:PORT = [string]$BackendPort
$be = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory (Join-Path $root "card-backend") -WindowStyle Hidden -RedirectStandardOutput $beOut -RedirectStandardError $beErr -PassThru
$env:PORT = [string]$FrontendPort
$fe = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $feOut -RedirectStandardError $feErr -PassThru

Start-Sleep -Seconds 2

function Stop-Servers {
  Stop-Process -Id $be.Id -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $fe.Id -Force -ErrorAction SilentlyContinue
}

try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/api/access-status" -UseBasicParsing -TimeoutSec 5
  Write-Output "direct access-status: $($r.StatusCode)"

  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$FrontendPort/api/access-status" -UseBasicParsing -TimeoutSec 5
  Write-Output "proxied access-status: $($r.StatusCode)"

  $opt = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/api/access-status" -Method OPTIONS -Headers @{ Origin = "http://127.0.0.1:$FrontendPort" } -UseBasicParsing -TimeoutSec 5
  Write-Output "OPTIONS allowed origin ACAO: $($opt.Headers['Access-Control-Allow-Origin'])"

  $opt = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/api/access-status" -Method OPTIONS -Headers @{ Origin = "http://evil.example" } -UseBasicParsing -TimeoutSec 5
  Write-Output "OPTIONS evil origin ACAO present: $([bool]$opt.Headers['Access-Control-Allow-Origin'])"

  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$FrontendPort/.dev.vars" -UseBasicParsing -TimeoutSec 5 | Out-Null
    Write-Output "GET .dev.vars: NOT BLOCKED (!)"
  } catch {
    Write-Output "GET .dev.vars blocked: $($_.Exception.Response.StatusCode.value__)"
  }

  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/卡密/cards.json" -UseBasicParsing -TimeoutSec 5 | Out-Null
    Write-Output "GET cards.json: NOT BLOCKED (!)"
  } catch {
    Write-Output "GET cards.json blocked: $($_.Exception.Response.StatusCode.value__)"
  }

  # 下载头测试：选一张未绑定图片的 active 卡密，伪造本地开发签名 token，
  # 验证 Content-Disposition 包含 UTF-8 文件名。测试后会恢复 cards.json。
  $data = Get-Content -Encoding UTF8 $store | ConvertFrom-Json
  $card = $data.cards | Where-Object { $_.status -eq "active" -and -not $_.imageHash } | Select-Object -First 1
  if ($card) {
    $token = @'
const crypto = require("crypto");
const payload = { paid: true, cardCode: process.argv[2], redeemedAt: new Date().toISOString() };
const base = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
const sig = crypto.createHmac("sha256", "pixel-workshop-dev-secret").update(base, "utf8").digest("hex");
process.stdout.write(`${base}.${sig}`);
'@ | node - $card.code
    $body = @{
      filename    = "拼豆图纸-with-code-64x64"
      dataUrl     = "data:image/png;base64,iVBORw0KGgo="
      imageHash   = "smoke-test-hash"
      accessToken = $token
    } | ConvertTo-Json
    $utf8Body = [System.Text.Encoding]::UTF8.GetBytes($body)
    try {
      $dl = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/api/download" -Method POST -ContentType "application/json; charset=utf-8" -Body $utf8Body -Headers @{ Origin = "http://127.0.0.1:$FrontendPort" } -UseBasicParsing -TimeoutSec 10
      Write-Output "download status: $($dl.StatusCode)"
      Write-Output "download Content-Disposition: $($dl.Headers['Content-Disposition'])"
    } catch {
      $resp = $_.Exception.Response
      if ($resp) {
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        Write-Output "download error status: $($resp.StatusCode.value__)"
        Write-Output "download error body: $($reader.ReadToEnd())"
      } else {
        Write-Output "download error: $($_.Exception.Message)"
      }
    }
  } else {
    Write-Output "download header test skipped (no eligible active card)"
  }
} catch {
  Write-Output "SMOKE TEST ERROR: $($_.Exception.Message)"
} finally {
  Stop-Servers
  Copy-Item -LiteralPath $backup -Destination $store -Force
  Remove-Item -LiteralPath $backup -Force
  Write-Output "cards.json restored"
}

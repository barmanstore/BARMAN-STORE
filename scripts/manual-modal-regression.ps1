param(
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [string]$BackendUrl = 'http://127.0.0.1:5000',
  [string]$AdminSessionJson = '{"id":1,"role":"admin","name":"Administrator","email":"nbsbsb@ymail.com","token":"eyJ1aWQiOjEsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NDM2MDM0MjM3MiwiZXhwIjoxNzc0OTY1MTQyMzczfQ.D6xC8RRQl2H_vtZbXZ4XEA-xs6mT2EYWgPXDoyOQ730"}',
  [int]$ChromePort = 9223,
  [bool]$ManageLocalServices = $true
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$chromeExe = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$viteCli = Join-Path $repoRoot 'node_modules\vite\bin\vite.js'
$tmpDir = Join-Path $repoRoot '.tmp'
$chromeProfile = Join-Path $tmpDir 'chrome-manual-regression-profile'
$chromeStdout = Join-Path $tmpDir 'chrome-manual-regression-stdout.log'
$chromeStderr = Join-Path $tmpDir 'chrome-manual-regression-stderr.log'
$frontendStdout = Join-Path $tmpDir 'modal-regression-vite-stdout.log'
$frontendStderr = Join-Path $tmpDir 'modal-regression-vite-stderr.log'
$backendStdout = Join-Path $tmpDir 'modal-regression-backend-stdout.log'
$backendStderr = Join-Path $tmpDir 'modal-regression-backend-stderr.log'
$startedFrontend = $null
$startedBackend = $null
$baseUri = [Uri]$BaseUrl
$frontendHost = $baseUri.Host
$frontendPort = if ($baseUri.IsDefaultPort) {
  if ($baseUri.Scheme -eq 'https') { 443 } else { 80 }
} else {
  $baseUri.Port
}
$apiProbeUrl = '{0}/api/products?limit=1' -f $BaseUrl.TrimEnd('/')

New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
if (Test-Path $chromeProfile) {
  Remove-Item -Force -Recurse $chromeProfile
}
foreach ($log in @($chromeStdout, $chromeStderr, $frontendStdout, $frontendStderr, $backendStdout, $backendStderr)) {
  if (Test-Path $log) {
    Remove-Item -Force $log
  }
}

$chrome = $null

$socket = $null
$failures = New-Object System.Collections.Generic.List[string]
$results = [ordered]@{}

function Test-UrlReady([string]$url) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Wait-ForUrl([string]$url, [int]$timeoutSeconds = 45, [int]$intervalMilliseconds = 500) {
  $deadline = [DateTime]::UtcNow.AddSeconds($timeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-UrlReady $url) {
      return $true
    }
    Start-Sleep -Milliseconds $intervalMilliseconds
  }
  throw "Timed out waiting for service URL: $url"
}

function Start-ManagedProcess([string]$filePath, [string[]]$argumentList, [string]$stdoutLog, [string]$stderrLog, [string]$workingDirectory) {
  return Start-Process -FilePath $filePath `
    -ArgumentList $argumentList `
    -WorkingDirectory $workingDirectory `
    -PassThru `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog
}

function Stop-ManagedProcess($process) {
  if (-not $process) { return }
  try {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force
    }
  } catch {}
}

function Receive-CdpMessage([System.Net.WebSockets.ClientWebSocket]$ws) {
  $buffer = New-Object byte[] 65536
  $builder = New-Object System.Text.StringBuilder
  do {
    $segment = [System.ArraySegment[byte]]::new($buffer)
    $receive = $ws.ReceiveAsync($segment, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
    if ($receive.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
      throw 'CDP socket closed unexpectedly.'
    }
    $null = $builder.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $receive.Count))
  } while (-not $receive.EndOfMessage)
  return $builder.ToString()
}

$script:cdpId = 0
function Send-Cdp([System.Net.WebSockets.ClientWebSocket]$ws, [string]$method, $params = @{}) {
  $script:cdpId += 1
  $messageId = $script:cdpId
  $payload = @{
    id = $messageId
    method = $method
    params = $params
  } | ConvertTo-Json -Compress -Depth 100
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [System.ArraySegment[byte]]::new($bytes)
  $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null

  while ($true) {
    $raw = Receive-CdpMessage $ws
    $message = $raw | ConvertFrom-Json -Depth 100
    if ($null -ne $message.id -and [int]$message.id -eq $messageId) {
      if ($message.error) {
        throw "CDP $method failed: $($message.error.message)"
      }
      return $message
    }
  }
}

function Invoke-Evaluate([System.Net.WebSockets.ClientWebSocket]$ws, [string]$expression) {
  $response = Send-Cdp $ws 'Runtime.evaluate' @{
    expression = $expression
    awaitPromise = $true
    returnByValue = $true
    userGesture = $true
  }
  if ($response.result.exceptionDetails) {
    throw "Evaluation failed: $($response.result.exceptionDetails.text)"
  }
  return $response.result.result.value
}

function Wait-For([System.Net.WebSockets.ClientWebSocket]$ws, [string]$expression, [int]$timeoutMs = 20000, [int]$intervalMs = 200) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $ready = Invoke-Evaluate $ws "(() => Boolean($expression))()"
      if ($ready) {
        return $true
      }
    } catch {
      # keep polling until the UI settles
    }
    Start-Sleep -Milliseconds $intervalMs
  }
  throw "Timed out waiting for: $expression"
}

function Press-Tab([System.Net.WebSockets.ClientWebSocket]$ws, [bool]$shift = $false) {
  $modifiers = if ($shift) { 8 } else { 0 }
  Send-Cdp $ws 'Input.dispatchKeyEvent' @{
    type = 'rawKeyDown'
    key = 'Tab'
    code = 'Tab'
    windowsVirtualKeyCode = 9
    nativeVirtualKeyCode = 9
    modifiers = $modifiers
  } | Out-Null
  Send-Cdp $ws 'Input.dispatchKeyEvent' @{
    type = 'keyUp'
    key = 'Tab'
    code = 'Tab'
    windowsVirtualKeyCode = 9
    nativeVirtualKeyCode = 9
    modifiers = $modifiers
  } | Out-Null
  Start-Sleep -Milliseconds 80
}

function Add-Check([bool]$condition, [string]$message) {
  if (-not $condition) {
    $failures.Add($message)
  }
}

$exprDesktopReady = @'
document.querySelector('.products-icon-btn-add') && document.querySelectorAll('.products-icon-btn').length >= 4
'@
$exprOneWindow = @'
document.querySelectorAll('.window-modal-frame').length >= 1
'@
$exprTwoWindows = @'
document.querySelectorAll('.window-modal-frame').length >= 2
'@
$exprTopDialogFocused = @'
(() => {
  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
  return !!dialog && dialog.contains(document.activeElement);
})()
'@
$exprSingleTopDialog = @'
document.querySelectorAll('[role="dialog"][aria-modal="true"]').length === 1
'@
$exprOneWindowRestored = @'
(() => {
  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
  return document.querySelectorAll('.window-modal-frame').length === 1
    && document.querySelectorAll('.window-modal-frame[aria-hidden="true"]').length === 0
    && !!dialog;
})()
'@
$exprMobileReady = @'
document.querySelectorAll('.card-view-btn').length > 0
'@
$exprSheetFocused = @'
(() => {
  const sheet = document.querySelector('.mobile-bottom-sheet');
  return !!sheet && sheet.contains(document.activeElement);
})()
'@

try {
  if (-not (Test-Path $chromeExe)) {
    throw "Chrome executable not found at $chromeExe"
  }

  if ($ManageLocalServices) {
    if (-not (Test-UrlReady $BackendUrl)) {
      $startedBackend = Start-ManagedProcess `
        -filePath 'node' `
        -argumentList @('-r', './server/loadEnv.js', 'server/index.js') `
        -stdoutLog $backendStdout `
        -stderrLog $backendStderr `
        -workingDirectory $repoRoot
      try {
        Wait-ForUrl $BackendUrl 60 500 | Out-Null
      } catch {
        $backendError = if (Test-Path $backendStderr) { (Get-Content $backendStderr -Raw).Trim() } else { '' }
        if ($backendError) {
          throw "Backend failed to start for modal regression. $backendError"
        }
        throw
      }
    }

    if (-not (Test-UrlReady $BaseUrl) -or -not (Test-UrlReady $apiProbeUrl)) {
      $startedFrontend = Start-ManagedProcess `
        -filePath 'node' `
        -argumentList @($viteCli, '--host', $frontendHost, '--port', [string]$frontendPort) `
        -stdoutLog $frontendStdout `
        -stderrLog $frontendStderr `
        -workingDirectory $repoRoot
      try {
        Wait-ForUrl $BaseUrl 60 500 | Out-Null
        Wait-ForUrl $apiProbeUrl 60 500 | Out-Null
      } catch {
        $frontendError = if (Test-Path $frontendStderr) { (Get-Content $frontendStderr -Raw).Trim() } else { '' }
        if ($frontendError -match 'spawn EPERM') {
          throw 'Frontend dev server could not start because the current shell blocked Vite/esbuild process spawning. Re-run `npm run test:modal-regression` from a normal host shell or with elevated tool permissions.'
        }
        if ($frontendError) {
          throw "Frontend dev server failed to start for modal regression. $frontendError"
        }
        throw
      }
    }
  }

  $chrome = Start-ManagedProcess `
    -filePath $chromeExe `
    -argumentList @(
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      "--remote-debugging-port=$ChromePort",
      "--user-data-dir=$chromeProfile",
      'about:blank'
    ) `
    -stdoutLog $chromeStdout `
    -stderrLog $chromeStderr `
    -workingDirectory $repoRoot

  Start-Sleep -Seconds 3
  Invoke-RestMethod ("http://127.0.0.1:{0}/json/version" -f $ChromePort) | Out-Null
  $target = Invoke-RestMethod ("http://127.0.0.1:{0}/json/new?about:blank" -f $ChromePort) -Method Put
  $socket = [System.Net.WebSockets.ClientWebSocket]::new()
  $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null

  Send-Cdp $socket 'Page.enable' | Out-Null
  Send-Cdp $socket 'Runtime.enable' | Out-Null
  Send-Cdp $socket 'DOM.enable' | Out-Null
  Send-Cdp $socket 'Page.addScriptToEvaluateOnNewDocument' @{
    source = @"
try {
  localStorage.setItem('user', JSON.stringify($AdminSessionJson));
  window.dispatchEvent(new Event('user-updated'));
} catch (_) {}
"@
  } | Out-Null

  Send-Cdp $socket 'Emulation.setDeviceMetricsOverride' @{
    width = 1280
    height = 900
    deviceScaleFactor = 1
    mobile = $false
  } | Out-Null
  Send-Cdp $socket 'Page.navigate' @{ url = "$BaseUrl/admin/products" } | Out-Null
  Wait-For $socket $exprDesktopReady 30000 250 | Out-Null
  Start-Sleep -Milliseconds 400

  Invoke-Evaluate $socket @'
(() => {
  document.querySelector('.products-icon-btn-add')?.click();
  return true;
})()
'@ | Out-Null
  Wait-For $socket $exprOneWindow 15000 200 | Out-Null
  Wait-For $socket $exprTopDialogFocused 15000 200 | Out-Null

  $desktopOpen = Invoke-Evaluate $socket @'
(() => {
  const frames = [...document.querySelectorAll('.window-modal-frame')];
  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
  return {
    count: frames.length,
    title: dialog?.querySelector('h2')?.textContent?.trim() || '',
    activeTag: document.activeElement?.tagName || '',
    activeClass: document.activeElement?.className || '',
  };
})()
'@

  $dragStart = Invoke-Evaluate $socket @'
(() => {
  const header = document.querySelector('.window-modal-frame.is-active .window-modal-header.is-draggable');
  const frame = header?.closest('.window-modal-frame');
  if (!header || !frame) return null;
  const rect = header.getBoundingClientRect();
  return {
    x: Math.round(rect.left + 80),
    y: Math.round(rect.top + 20),
    beforeLeft: frame.style.left,
    beforeTop: frame.style.top,
  };
})()
'@
  if ($dragStart) {
    Send-Cdp $socket 'Input.dispatchMouseEvent' @{
      type = 'mousePressed'
      x = [int]$dragStart.x
      y = [int]$dragStart.y
      button = 'left'
      buttons = 1
      clickCount = 1
    } | Out-Null
    Send-Cdp $socket 'Input.dispatchMouseEvent' @{
      type = 'mouseMoved'
      x = [int]($dragStart.x + 160)
      y = [int]($dragStart.y + 110)
      button = 'left'
      buttons = 1
    } | Out-Null
    Send-Cdp $socket 'Input.dispatchMouseEvent' @{
      type = 'mouseReleased'
      x = [int]($dragStart.x + 160)
      y = [int]($dragStart.y + 110)
      button = 'left'
      buttons = 0
      clickCount = 1
    } | Out-Null
    Start-Sleep -Milliseconds 250
  }
  $desktopDrag = Invoke-Evaluate $socket @'
(() => {
  const frame = document.querySelector('.window-modal-frame.is-active');
  return {
    afterLeft: frame?.style.left || '',
    afterTop: frame?.style.top || '',
  };
})()
'@
  $desktopDragResult = [ordered]@{
    moved = ($dragStart -and (($dragStart.beforeLeft -ne $desktopDrag.afterLeft) -or ($dragStart.beforeTop -ne $desktopDrag.afterTop)))
    beforeLeft = if ($dragStart) { $dragStart.beforeLeft } else { '' }
    beforeTop = if ($dragStart) { $dragStart.beforeTop } else { '' }
    afterLeft = $desktopDrag.afterLeft
    afterTop = $desktopDrag.afterTop
  }

  Invoke-Evaluate $socket @'
(() => {
  const buttons = document.querySelectorAll('.products-icon-btn');
  if (buttons.length > 1) buttons[1].click();
  return true;
})()
'@ | Out-Null
  Wait-For $socket $exprTwoWindows 15000 200 | Out-Null
  Wait-For $socket $exprSingleTopDialog 10000 200 | Out-Null
  Wait-For $socket $exprTopDialogFocused 15000 200 | Out-Null

  $desktopStack = Invoke-Evaluate $socket @'
(() => {
  const frames = [...document.querySelectorAll('.window-modal-frame')];
  const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
  const topDialog = dialogs[0] || null;
  const backgroundRoot = document.querySelector('[data-window-background-root="true"]')
    || document.querySelector('.app')
    || document.getElementById('root');
  return {
    frameCount: frames.length,
    modalDialogCount: dialogs.length,
    hiddenCount: frames.filter((frame) => frame.getAttribute('aria-hidden') === 'true').length,
    topTitle: topDialog?.querySelector('h2')?.textContent?.trim() || '',
    backgroundRootAriaHidden: backgroundRoot?.getAttribute('aria-hidden') || null,
    backgroundRootInert: Boolean(backgroundRoot?.inert),
  };
})()
'@

  $desktopFocusSteps = @()
  for ($i = 0; $i -lt 6; $i += 1) {
    Press-Tab $socket $false
    $desktopFocusSteps += [bool](Invoke-Evaluate $socket $exprTopDialogFocused)
  }
  Press-Tab $socket $true
  $desktopShiftWithin = [bool](Invoke-Evaluate $socket $exprTopDialogFocused)
  $desktopFocus = [ordered]@{
    allTabsWithin = -not ($desktopFocusSteps -contains $false)
    shiftTabWithin = $desktopShiftWithin
    steps = $desktopFocusSteps
    activeTag = Invoke-Evaluate $socket 'document.activeElement?.tagName || ""'
    activeClass = Invoke-Evaluate $socket 'document.activeElement?.className || ""'
  }

  Invoke-Evaluate $socket @'
(() => {
  const closeBtn = document.querySelector('[role="dialog"][aria-modal="true"] [data-modal-close="true"]');
  closeBtn?.click();
  return true;
})()
'@ | Out-Null
  Wait-For $socket $exprOneWindowRestored 15000 200 | Out-Null
  $desktopAfterClose = Invoke-Evaluate $socket @'
(() => {
  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
  return {
    title: dialog?.querySelector('h2')?.textContent?.trim() || '',
    frameCount: document.querySelectorAll('.window-modal-frame').length,
    hiddenCount: document.querySelectorAll('.window-modal-frame[aria-hidden="true"]').length,
  };
})()
'@

  Send-Cdp $socket 'Emulation.setEmulatedMedia' @{
    features = @(@{ name = 'prefers-reduced-motion'; value = 'reduce' })
  } | Out-Null
  Send-Cdp $socket 'Emulation.setDeviceMetricsOverride' @{
    width = 1280
    height = 900
    deviceScaleFactor = 1
    mobile = $false
  } | Out-Null
  Send-Cdp $socket 'Page.navigate' @{ url = "$BaseUrl/admin/products" } | Out-Null
  Wait-For $socket $exprDesktopReady 30000 250 | Out-Null
  Start-Sleep -Milliseconds 300
  Invoke-Evaluate $socket @'
(() => {
  document.querySelector('.products-icon-btn-add')?.click();
  return true;
})()
'@ | Out-Null
  Wait-For $socket $exprOneWindow 15000 200 | Out-Null
  $desktopReduced = Invoke-Evaluate $socket @'
(() => {
  const frame = document.querySelector('.window-modal-frame');
  const backdrop = document.querySelector('.window-manager-backdrop');
  const frameStyle = frame ? window.getComputedStyle(frame) : null;
  const backdropStyle = backdrop ? window.getComputedStyle(backdrop) : null;
  return {
    mediaMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    transitionDuration: frameStyle?.transitionDuration || '',
    transitionProperty: frameStyle?.transitionProperty || '',
    backdropFilter: backdropStyle?.backdropFilter || '',
  };
})()
'@

  $results.desktop = [ordered]@{
    firstOpen = $desktopOpen
    drag = $desktopDragResult
    stacked = $desktopStack
    focusTrap = $desktopFocus
    afterTopClose = $desktopAfterClose
    reducedMotion = $desktopReduced
  }

  Add-Check ($desktopOpen.count -eq 1) 'Desktop product modal did not open as expected.'
  Add-Check ([bool]$desktopDragResult.moved) 'Desktop modal drag did not change position.'
  Add-Check ($desktopStack.frameCount -eq 2) 'Desktop stacked modal check did not produce two visible windows.'
  Add-Check ($desktopStack.modalDialogCount -eq 1) 'More than one desktop dialog was exposed as aria-modal=true.'
  Add-Check ($desktopStack.hiddenCount -ge 1) 'Underlying desktop window was not hidden from assistive technology while stacked.'
  Add-Check ($desktopStack.backgroundRootAriaHidden -eq 'true') 'Desktop stacked modal did not mark the shared background root aria-hidden.'
  Add-Check ([bool]$desktopStack.backgroundRootInert) 'Desktop stacked modal did not inert the shared background root.'
  Add-Check ([bool]$desktopFocus.allTabsWithin) 'Desktop focus escaped the top stacked window during Tab navigation.'
  Add-Check ([bool]$desktopFocus.shiftTabWithin) 'Desktop focus escaped the top stacked window during Shift+Tab.'
  Add-Check ($desktopAfterClose.frameCount -eq 1 -and $desktopAfterClose.hiddenCount -eq 0) 'Desktop stacked close did not restore the remaining window cleanly.'
  Add-Check ([bool]$desktopReduced.mediaMatches) 'Desktop reduced-motion emulation did not apply.'
  $desktopTransitionDurationSeconds = 0.0
  if (-not [double]::TryParse([string]($desktopReduced.transitionDuration -replace 's$', ''), [ref]$desktopTransitionDurationSeconds)) {
    $desktopTransitionDurationSeconds = 1.0
  }
  Add-Check (
    $desktopReduced.transitionProperty -eq 'none' -or $desktopTransitionDurationSeconds -le 0.001
  ) 'Desktop modal transition was not disabled under reduced motion.'

  Send-Cdp $socket 'Emulation.setEmulatedMedia' @{ features = @() } | Out-Null
  Send-Cdp $socket 'Emulation.setDeviceMetricsOverride' @{
    width = 390
    height = 844
    deviceScaleFactor = 2
    mobile = $true
  } | Out-Null
  Send-Cdp $socket 'Emulation.setTouchEmulationEnabled' @{
    enabled = $true
    maxTouchPoints = 1
  } | Out-Null
  Send-Cdp $socket 'Page.navigate' @{ url = "$BaseUrl/products" } | Out-Null
  Wait-For $socket $exprMobileReady 30000 250 | Out-Null
  Start-Sleep -Milliseconds 500
  Invoke-Evaluate $socket @'
(() => {
  document.querySelector('.card-view-btn')?.click();
  return true;
})()
'@ | Out-Null
  Wait-For $socket 'document.querySelector(".mobile-bottom-sheet")' 15000 200 | Out-Null
  Wait-For $socket $exprSheetFocused 15000 200 | Out-Null

  $mobileInitial = Invoke-Evaluate $socket @'
(() => {
  const sheet = document.querySelector('.mobile-bottom-sheet');
  const backgroundRoot = document.querySelector('[data-window-background-root="true"]')
    || document.querySelector('.app')
    || document.getElementById('root');
  return {
    activeTag: document.activeElement?.tagName || '',
    activeClass: document.activeElement?.className || '',
    backgroundRootAriaHidden: backgroundRoot?.getAttribute('aria-hidden') || null,
    backgroundRootInert: Boolean(backgroundRoot?.inert),
    withinSheet: !!sheet && sheet.contains(document.activeElement),
  };
})()
'@

  $mobileFocusSteps = @()
  for ($i = 0; $i -lt 8; $i += 1) {
    Press-Tab $socket $false
    $mobileFocusSteps += [bool](Invoke-Evaluate $socket $exprSheetFocused)
  }
  Press-Tab $socket $true
  $mobileShiftWithin = [bool](Invoke-Evaluate $socket $exprSheetFocused)
  $mobileFocus = [ordered]@{
    initial = $mobileInitial
    allTabsWithin = -not ($mobileFocusSteps -contains $false)
    shiftTabWithin = $mobileShiftWithin
    steps = $mobileFocusSteps
    activeTag = Invoke-Evaluate $socket 'document.activeElement?.tagName || ""'
    activeClass = Invoke-Evaluate $socket 'document.activeElement?.className || ""'
  }

  Send-Cdp $socket 'Emulation.setEmulatedMedia' @{
    features = @(@{ name = 'prefers-reduced-motion'; value = 'reduce' })
  } | Out-Null
  Send-Cdp $socket 'Page.navigate' @{ url = "$BaseUrl/products" } | Out-Null
  Wait-For $socket $exprMobileReady 30000 250 | Out-Null
  Start-Sleep -Milliseconds 500
  Invoke-Evaluate $socket @'
(() => {
  document.querySelector('.card-view-btn')?.click();
  return true;
})()
'@ | Out-Null
  Wait-For $socket 'document.querySelector(".mobile-bottom-sheet")' 15000 200 | Out-Null
  $mobileReduced = Invoke-Evaluate $socket @'
(() => {
  const sheet = document.querySelector('.mobile-bottom-sheet');
  const style = sheet ? window.getComputedStyle(sheet) : null;
  return {
    mediaMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    animationName: style?.animationName || '',
    animationDuration: style?.animationDuration || '',
  };
})()
'@

  $results.mobile = [ordered]@{
    focusTrap = $mobileFocus
    reducedMotion = $mobileReduced
  }

  Add-Check ([bool]$mobileInitial.withinSheet) 'Mobile sheet did not focus an element inside the sheet on open.'
  Add-Check ([bool]$mobileFocus.allTabsWithin) 'Mobile sheet focus escaped during Tab navigation.'
  Add-Check ([bool]$mobileFocus.shiftTabWithin) 'Mobile sheet focus escaped during Shift+Tab.'
  Add-Check ($mobileInitial.backgroundRootAriaHidden -eq 'true') 'Mobile sheet did not mark the shared background root aria-hidden while open.'
  Add-Check ([bool]$mobileInitial.backgroundRootInert) 'Mobile sheet did not inert the shared background root while open.'
  Add-Check ([bool]$mobileReduced.mediaMatches) 'Mobile reduced-motion emulation did not apply.'
  Add-Check ($mobileReduced.animationName -eq 'none') 'Mobile sheet animation was not disabled under reduced motion.'

  $results.failures = @($failures)
  $results.status = if ($failures.Count -eq 0) { 'passed' } else { 'failed' }
  $results.timestamp = (Get-Date).ToString('s')
  $results.baseUrl = $BaseUrl
  $results.backendUrl = $BackendUrl
  $results.serviceManagement = [ordered]@{
    managedLocally = $ManageLocalServices
    startedFrontend = [bool]$startedFrontend
    startedBackend = [bool]$startedBackend
  }
  $results | ConvertTo-Json -Depth 20

  if ($failures.Count -gt 0) {
    exit 1
  }
}
finally {
  if ($socket) {
    try { $socket.Dispose() } catch {}
  }
  Stop-ManagedProcess $chrome
  Stop-ManagedProcess $startedFrontend
  Stop-ManagedProcess $startedBackend
}

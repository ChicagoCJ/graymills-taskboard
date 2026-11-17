param(
    [Parameter(Mandatory = $true)][string]$Email,
    [Parameter(Mandatory = $true)][string]$DatabaseHost,
    [Parameter(Mandatory = $true)][string]$ProjectRef
)

$ErrorActionPreference = "Stop"
$seoOriginalLocation = Get-Location
$seoPreviousEnvironment = @{}
$seoEnvironmentNames = @(
    "OAUTH_OPERATOR_DATABASE_URL", "OAUTH_OPERATOR_PASSWORD", "OAUTH_OPERATOR_EMAIL",
    "OAUTH_OPERATOR_EXPECTED_HOST", "OAUTH_OPERATOR_EXPECTED_PROJECT_REF"
)
foreach ($seoName in $seoEnvironmentNames) {
    $seoPreviousEnvironment[$seoName] = [Environment]::GetEnvironmentVariable($seoName, "Process")
}

function Read-SeoMaskedValue([string]$Prompt) {
    $seoSecure = Read-Host $Prompt -AsSecureString
    $seoPointer = [IntPtr]::Zero
    try {
        $seoPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seoSecure)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($seoPointer)
    }
    finally {
        if ($seoPointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($seoPointer)
        }
        $seoSecure.Dispose()
    }
}

try {
    Set-Location $PSScriptRoot
    $seoNodeVersion = @(& node --version)
    if ($LASTEXITCODE -ne 0 -or ($seoNodeVersion -join "") -notmatch '^v(22|24|26)\.') {
        throw "Use Node.js 22, 24 or 26 for this setup."
    }
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed. No login was created." }

    Write-Host "Use the saved OAUTH_DATABASE_URL for the restricted database role."
    Write-Host "Choose and save a separate OAuth login password (16 to 128 characters)."
    $seoDatabaseUrl = Read-SeoMaskedValue "Paste saved OAUTH_DATABASE_URL"
    $seoPassword = Read-SeoMaskedValue "Choose OAuth login password"
    $seoConfirmPassword = Read-SeoMaskedValue "Repeat OAuth login password"
    if ($seoPassword -cne $seoConfirmPassword) { throw "Passwords did not match. No login was created." }

    $env:OAUTH_OPERATOR_DATABASE_URL = $seoDatabaseUrl
    $env:OAUTH_OPERATOR_PASSWORD = $seoPassword
    $env:OAUTH_OPERATOR_EMAIL = $Email
    $env:OAUTH_OPERATOR_EXPECTED_HOST = $DatabaseHost
    $env:OAUTH_OPERATOR_EXPECTED_PROJECT_REF = $ProjectRef
    & node setup-operator-login.mjs
    if ($LASTEXITCODE -ne 0) { throw "Operator login setup did not complete. See the message above." }
}
catch {
    Write-Host "SETUP STOPPED:" $_.Exception.Message
}
finally {
    foreach ($seoName in $seoEnvironmentNames) {
        [Environment]::SetEnvironmentVariable($seoName, $seoPreviousEnvironment[$seoName], "Process")
    }
    Remove-Variable seoDatabaseUrl,seoPassword,seoConfirmPassword,seoPreviousEnvironment -ErrorAction SilentlyContinue
    Set-Location $seoOriginalLocation
}

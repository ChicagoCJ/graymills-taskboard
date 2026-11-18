param(
    [Parameter(Mandatory = $true)][string]$Email,
    [Parameter(Mandatory = $true)][string]$Subject,
    [Parameter(Mandatory = $true)][string]$CertificateFile,
    [Parameter(Mandatory = $true)][string]$DatabaseHost,
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [Parameter(Mandatory = $true)][string]$VercelProject,
    [Parameter(Mandatory = $true)][string]$VercelTeam,
    [Parameter(Mandatory = $true)][string]$VercelScope
)

$ErrorActionPreference = "Stop"
$seoOriginalLocation = Get-Location
$seoPreviousEnvironment = @{}
$seoNames = @(
    "OAUTH_SETUP_DATABASE_URL", "OAUTH_SETUP_PASSWORD", "OAUTH_SETUP_SERVER_SECRET",
    "OAUTH_SETUP_EMAIL", "OAUTH_SETUP_SUBJECT", "OAUTH_SETUP_CA_FILE",
    "OAUTH_SETUP_DATABASE_HOST", "OAUTH_SETUP_PROJECT_REF", "OAUTH_SETUP_VERCEL_PROJECT",
    "OAUTH_SETUP_VERCEL_TEAM", "OAUTH_SETUP_VERCEL_SCOPE", "NODE_EXTRA_CA_CERTS", "NODE_USE_SYSTEM_CA"
)
foreach ($seoName in $seoNames) {
    $seoPreviousEnvironment[$seoName] = [Environment]::GetEnvironmentVariable($seoName, "Process")
}

function Read-SeoClientSecret([string]$Prompt) {
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
    $seoCert = Get-Item -LiteralPath $CertificateFile -ErrorAction Stop
    if ((Get-Content -LiteralPath $seoCert.FullName -Raw) -notmatch '-----BEGIN CERTIFICATE-----') {
        throw "Select the downloaded Supabase CA certificate."
    }
    $env:NODE_EXTRA_CA_CERTS = $seoCert.FullName
    $env:NODE_USE_SYSTEM_CA = "1"
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }

    Write-Host "This prepares the validation client and saves its generated secret directly into Vercel."
    Write-Host "Use the values already saved during setup; these prompts do not create new passwords."
    $env:OAUTH_SETUP_DATABASE_URL = Read-SeoClientSecret "Paste saved OAUTH_DATABASE_URL"
    $env:OAUTH_SETUP_SERVER_SECRET = Read-SeoClientSecret "Paste saved OAUTH_SERVER_SECRET"
    $env:OAUTH_SETUP_PASSWORD = Read-SeoClientSecret "Enter the NEW OAuth login password you chose"
    $env:OAUTH_SETUP_EMAIL = $Email
    $env:OAUTH_SETUP_SUBJECT = $Subject
    $env:OAUTH_SETUP_CA_FILE = $seoCert.FullName
    $env:OAUTH_SETUP_DATABASE_HOST = $DatabaseHost
    $env:OAUTH_SETUP_PROJECT_REF = $ProjectRef
    $env:OAUTH_SETUP_VERCEL_PROJECT = $VercelProject
    $env:OAUTH_SETUP_VERCEL_TEAM = $VercelTeam
    $env:OAUTH_SETUP_VERCEL_SCOPE = $VercelScope
    & node --import tsx setup-introspection-client.ts
    if ($LASTEXITCODE -ne 0) { throw "Client setup did not complete. See the safe message above." }
}
catch {
    Write-Host "SETUP STOPPED:" $_.Exception.Message
}
finally {
    foreach ($seoName in $seoNames) {
        [Environment]::SetEnvironmentVariable($seoName, $seoPreviousEnvironment[$seoName], "Process")
    }
    Remove-Variable seoPreviousEnvironment -ErrorAction SilentlyContinue
    Set-Location $seoOriginalLocation
}

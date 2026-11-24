$ErrorActionPreference = 'Stop'
$projectName = 'graymills-taskboard-outlook-test'
$teamId = 'team_fsU0dpRzNNHfqV5F8jtmYpkX'
$addonDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\outlook-addin'))
$cli = Get-Command vercel.cmd -ErrorAction SilentlyContinue
if (-not $cli) { $cli = Get-Command vercel -ErrorAction SilentlyContinue }
if (-not $cli) { throw 'Vercel CLI was not found. Use your existing TaskBoard development computer.' }
if (-not (Test-Path (Join-Path $addonDirectory 'manifest.xml'))) { throw 'The Outlook add-in source is missing.' }

function Invoke-AddonProjectApi {
    param([string]$Path, [string]$Method = 'GET', $Body = $null, [switch]$AllowMissing)
    $inputPath = [IO.Path]::GetTempFileName()
    $errorPath = [IO.Path]::GetTempFileName()
    try {
        $arguments = @('api', $Path, '--method', $Method)
        if ($null -ne $Body) {
            [IO.File]::WriteAllText($inputPath, ($Body | ConvertTo-Json -Depth 8 -Compress), (New-Object Text.UTF8Encoding($false)))
            $arguments += @('--input', $inputPath)
        }
        $previousErrorAction = $ErrorActionPreference
        try {
            # Windows PowerShell treats native stderr as error records, even for
            # a successful CLI banner. Use the process exit code as the result.
            $ErrorActionPreference = 'Continue'
            $lines = & $cli.Source @arguments 2> $errorPath
            $exitCode = $LASTEXITCODE
        }
        finally { $ErrorActionPreference = $previousErrorAction }
        if ($exitCode -ne 0) {
            $failure = (Get-Content $errorPath -Raw -ErrorAction SilentlyContinue) + ($lines -join "`n")
            if ($AllowMissing -and $failure -match '(?i)project_not_found|404|could not find the project|project not found') { return $null }
            throw "Vercel project request failed ($Method). Check your Vercel login and team permissions. No TaskBoard settings were changed."
        }
        try { return (($lines -join "`n") | ConvertFrom-Json) }
        catch { throw 'Vercel returned an unexpected project response. Setup stopped.' }
    }
    finally {
        Remove-Item $inputPath, $errorPath -Force -ErrorAction SilentlyContinue
    }
}

Write-Host 'Preparing the separate Outlook add-in host. This does not deploy TaskBoard or change its OAuth settings.'
$project = Invoke-AddonProjectApi -Path "/v9/projects/$projectName`?teamId=$teamId" -AllowMissing
if ($null -eq $project) {
    $project = Invoke-AddonProjectApi -Path "/v11/projects?teamId=$teamId" -Method 'POST' -Body @{
        name = $projectName
        framework = $null
        ssoProtection = $null
        publicSource = $false
    }
}
if ($project.name -ne $projectName -or $project.accountId -ne $teamId -or $project.id -notmatch '^prj_[A-Za-z0-9]+$') {
    throw 'The returned project does not match the approved Outlook add-in project and team. Setup stopped.'
}

# Only static add-in assets must be public so Office can load them.
# The main TaskBoard application and both OAuth services are never patched.
$null = Invoke-AddonProjectApi -Path "/v9/projects/$($project.id)?teamId=$teamId" -Method 'PATCH' -Body @{
    framework = $null
    ssoProtection = $null
    publicSource = $false
    buildCommand = $null
    installCommand = ''
    outputDirectory = $null
    rootDirectory = $null
}
$linkDirectory = Join-Path $addonDirectory '.vercel'
$linkPath = Join-Path $linkDirectory 'project.json'
if (Test-Path $linkPath) {
    $existingLink = Get-Content $linkPath -Raw | ConvertFrom-Json
    if ($existingLink.projectId -ne $project.id -or $existingLink.orgId -ne $teamId) { throw 'The add-in folder is already linked to a different project. Setup stopped.' }
}
$null = New-Item -ItemType Directory -Path $linkDirectory -Force
[IO.File]::WriteAllText($linkPath, (@{ projectId = $project.id; orgId = $teamId; projectName = $projectName } | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
$previousErrorAction = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & $cli.Source deploy --cwd $addonDirectory --prod --scope $teamId --yes
    $deployExitCode = $LASTEXITCODE
}
finally { $ErrorActionPreference = $previousErrorAction }
if ($deployExitCode -ne 0) { throw 'The Outlook add-in deployment did not finish. No TaskBoard deployment was changed.' }

$origin = 'https://graymills-taskboard-outlook-test.vercel.app'
$page = Invoke-WebRequest -UseBasicParsing -Uri "$origin/index.html" -ErrorAction Stop
if ($page.StatusCode -ne 200 -or $page.Content -notmatch 'Create a task from this email') { throw 'Office cannot yet load the public add-in page.' }
$manifest = Invoke-WebRequest -UseBasicParsing -Uri "$origin/manifest.xml" -ErrorAction Stop
if ($manifest.StatusCode -ne 200 -or $manifest.Content -notmatch '<OfficeApp') { throw 'The Outlook manifest is not publicly reachable yet.' }
Write-Host 'PASS: Outlook add-in assets and manifest are publicly reachable.'
Write-Host "Manifest file for one-time Outlook installation: $(Join-Path $addonDirectory 'manifest.xml')"
Write-Host 'Return to ChatGPT with this result for the one-time Outlook installation step.'

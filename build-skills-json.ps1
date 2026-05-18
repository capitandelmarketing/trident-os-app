# build-skills-json.ps1
# Reads the 44 .md files from .app-upload\_TRIDENT-OS-v3-FLAT-FOR-UPLOAD\
# Packages them into skills.json (used by the Trident OS web app)
# Run from the trident-os-app folder: powershell -ExecutionPolicy Bypass -File .\build-skills-json.ps1

$ErrorActionPreference = "Stop"

$sourceDir = "C:\Users\Usuario\capitan-del-marketing\.app-upload\_TRIDENT-OS-v3-FLAT-FOR-UPLOAD"
$outputFile = Join-Path $PSScriptRoot "skills.json"

if (-not (Test-Path $sourceDir)) {
    Write-Error "Source directory not found: $sourceDir"
    exit 1
}

$files = Get-ChildItem -Path $sourceDir -Filter "*.md" | Sort-Object Name

Write-Host "Found $($files.Count) .md files in source directory" -ForegroundColor Cyan

function Get-Category {
    param([string]$filename)
    $prefix = $filename.Substring(0, 2)
    switch -Regex ($prefix) {
        "^0[0-3]$" { return "meta_docs" }
        "^10$"     { return "nucleus_main" }
        "^1[1-9]$" { return "universal" }
        "^20$"     { return "universal" }
        "^3[0-1]$" { return "language" }
        "^4[0-8]$" { return "nationality" }
        "^5[0-4]$" { return "tone" }
        "^6[0-2]$" { return "transversal" }
        "^7[0-3]$" { return "qa_validator" }
        "^8[0-5]$" { return "pillars" }
        default    { return "unknown" }
    }
}

function Get-DisplayName {
    param([string]$filename)
    # Strip prefix and .md, replace dashes with spaces, title-case
    $name = $filename -replace "^\d{2}-", "" -replace "\.md$", "" -replace "-", " "
    $name = (Get-Culture).TextInfo.ToTitleCase($name.ToLower())
    return $name
}

$skills = @()
$counts = @{
    meta_docs = 0
    nucleus_main = 0
    universal = 0
    language = 0
    nationality = 0
    tone = 0
    transversal = 0
    qa_validator = 0
    pillars = 0
    unknown = 0
}

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
    $category = Get-Category -filename $file.Name
    $counts[$category]++

    $skills += [PSCustomObject]@{
        id           = $file.BaseName
        filename     = $file.Name
        category     = $category
        name         = Get-DisplayName -filename $file.Name
        size_bytes   = $file.Length
        line_count   = ($content -split "`n").Count
        content      = $content
    }
    Write-Host "  [$category] $($file.Name) ($($file.Length) bytes)" -ForegroundColor Gray
}

$payload = [PSCustomObject]@{
    meta = [PSCustomObject]@{
        version       = "v3"
        generated_at  = (Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz")
        source_dir    = $sourceDir
        total_files   = $files.Count
        total_size    = ($files | Measure-Object -Property Length -Sum).Sum
    }
    counts = $counts
    expected_counts = [PSCustomObject]@{
        meta_docs    = 4
        nucleus_main = 1
        universal    = 10
        language     = 2
        nationality  = 9
        tone         = 5
        transversal  = 3
        qa_validator = 4
        pillars      = 6
        total        = 44
    }
    skills = $skills
}

$json = $payload | ConvertTo-Json -Depth 10 -Compress:$false
[System.IO.File]::WriteAllText($outputFile, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Wrote $outputFile" -ForegroundColor Green
Write-Host "Total: $($files.Count) files / $([math]::Round((($files | Measure-Object -Property Length -Sum).Sum) / 1KB, 1)) KB" -ForegroundColor Green
Write-Host ""
Write-Host "Category breakdown:" -ForegroundColor Cyan
foreach ($key in $counts.Keys | Sort-Object) {
    $expected = $payload.expected_counts.$key
    $actual = $counts[$key]
    $status = if ($actual -eq $expected) { "OK" } else { "MISMATCH (expected $expected)" }
    Write-Host ("  {0,-15} {1,3} [{2}]" -f $key, $actual, $status)
}

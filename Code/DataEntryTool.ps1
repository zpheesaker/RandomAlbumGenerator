Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$stagingDir = Join-Path -Path $PSScriptRoot -ChildPath "..\Data\Staging"
$dataDir = Join-Path -Path $PSScriptRoot -ChildPath "..\Data"

if (-not (Test-Path -Path $stagingDir)) { New-Item -ItemType Directory -Path $stagingDir | Out-Null }
if (-not (Test-Path -Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

$stagingCsvPath = Join-Path -Path $stagingDir -ChildPath "rym_clean1.csv"
$mainCsvPath = Join-Path -Path $dataDir -ChildPath "rym_clean1.csv"
$mainDescPath = Join-Path -Path $dataDir -ChildPath "descriptors_reference.csv"
$mainJsonPath = Join-Path -Path $dataDir -ChildPath "filtered_hierarchy.json"

# --- Form Setup ---
$form = New-Object System.Windows.Forms.Form
$form.Text = "Data Entry & Merge Tool"
$form.Size = New-Object System.Drawing.Size(420, 500)
$form.StartPosition = "CenterScreen"

$labelY = 20
function Add-Input ($LabelText, $DefaultValue) {
    if ($LabelText -ne $null) {
        $lbl = New-Object System.Windows.Forms.Label
        $lbl.Text = $LabelText
        $lbl.Location = New-Object System.Drawing.Point(20, $labelY)
        $lbl.AutoSize = $true
        $form.Controls.Add($lbl)
    }

    $txt = New-Object System.Windows.Forms.TextBox
    $txt.Location = New-Object System.Drawing.Point(150, $labelY)
    $txt.Size = New-Object System.Drawing.Size(230, 20)
    $txt.Text = $DefaultValue
    $form.Controls.Add($txt)

    $global:labelY += 35
    return $txt
}

$txtRelease = Add-Input "Album Name:" "Example Album"
$txtArtist = Add-Input "Artist Name:" "The Band"
$txtDate = Add-Input "Release Date:" "2024-05-15"
$txtPrim = Add-Input "Primary Genres:" "Alternative Rock, Indie"
$txtDesc = Add-Input "Descriptors:" "upbeat, energetic, malevocals"
$txtRating = Add-Input "Avg Rating:" "4.0"

$global:labelY += 15

# --- Save to Staging ---
$btnSave = New-Object System.Windows.Forms.Button
$btnSave.Text = "Save Entry to Staging (rym_clean1.csv)"
$btnSave.Location = New-Object System.Drawing.Point(20, $labelY)
$btnSave.Size = New-Object System.Drawing.Size(360, 35)
$btnSave.Add_Click({
    $header = '"H1","position","release_name","artist_name","release_date","release_type","primary_genres","secondary_genres","descriptors","avg_rating","rating_count","review_count","listened"'
    if (-not (Test-Path $stagingCsvPath)) { Set-Content -Path $stagingCsvPath -Value $header -Encoding UTF8 }

    $randomId = Get-Random -Minimum 1000 -Maximum 99999
    $newLine = "`"$randomId`",`"1`",`"$($txtRelease.Text)`",`"$($txtArtist.Text)`",`"$($txtDate.Text)`",`"album`",`"$($txtPrim.Text)`",`"NA`",`"$($txtDesc.Text)`",`"$($txtRating.Text)`",`"1`",`"0`",`"0`""
    Add-Content -Path $stagingCsvPath -Value $newLine -Encoding UTF8
    [System.Windows.Forms.MessageBox]::Show("Saved record to Data\Staging\rym_clean1.csv!", "Success")
    
    # Clear fields
    $txtRelease.Text = ""
    $txtArtist.Text = ""
})
$form.Controls.Add($btnSave)

$global:labelY += 45

# --- Merge & Generate ---
$btnMerge = New-Object System.Windows.Forms.Button
$btnMerge.Text = "Merge Staging to Main & Auto-Generate Configs"
$btnMerge.Location = New-Object System.Drawing.Point(20, $labelY)
$btnMerge.Size = New-Object System.Drawing.Size(360, 45)
$btnMerge.BackColor = [System.Drawing.Color]::LightGreen
$btnMerge.Add_Click({
    if (-not (Test-Path $stagingCsvPath)) {
        [System.Windows.Forms.MessageBox]::Show("No staging data found. Add albums or run GenerateSampleData first.", "Error")
        return
    }

    # 1. Merge CSVs
    $header = '"H1","position","release_name","artist_name","release_date","release_type","primary_genres","secondary_genres","descriptors","avg_rating","rating_count","review_count","listened"'
    if (-not (Test-Path $mainCsvPath)) { 
        Set-Content -Path $mainCsvPath -Value $header -Encoding UTF8 
    }
    
    $stagingData = Get-Content $stagingCsvPath
    if ($stagingData.Count -gt 1) {
        $dataToAppend = $stagingData | Select-Object -Skip 1
        Add-Content -Path $mainCsvPath -Value $dataToAppend -Encoding UTF8
    }

    Remove-Item $stagingCsvPath -Force -ErrorAction SilentlyContinue
    
    # Also clean up staged json/desc files if they exist from GenerateSampleData
    $stagedJson = Join-Path -Path $stagingDir -ChildPath "filtered_hierarchy.json"
    $stagedDesc = Join-Path -Path $stagingDir -ChildPath "descriptors_reference.csv"
    if (Test-Path $stagedJson) { Remove-Item $stagedJson -Force }
    if (Test-Path $stagedDesc) { Remove-Item $stagedDesc -Force }

    # Generate supporting files based entirely on main CSV
    $allData = Import-Csv $mainCsvPath

    # 2. Re-generate descriptors_reference.csv
    $descCounts = @{}
    $allData | ForEach-Object {
        if ($_.descriptors -and $_.descriptors -ne "NA") {
            $_.descriptors -split ',' | ForEach-Object {
                $d = $_.Trim()
                if ($d) { $descCounts[$d]++ }
            }
        }
    }
    $descOut = @()
    foreach ($k in $descCounts.Keys) {
        $descOut += New-Object PSObject -Property @{ descriptor = $k; count = $descCounts[$k] }
    }
    $descOut | Select-Object descriptor, count | Export-Csv $mainDescPath -NoTypeInformation -Encoding UTF8

    # 3. Re-generate filtered_hierarchy.json
    $uniqueGenres = @()
    $allData | ForEach-Object {
        if ($_.primary_genres -and $_.primary_genres -ne "NA") {
            $_.primary_genres -split ',' | ForEach-Object { $uniqueGenres += $_.Trim() }
        }
    }
    $uniqueGenres = $uniqueGenres | Select-Object -Unique | Where-Object { $_ }
    
    $children = @()
    foreach ($g in $uniqueGenres) {
        $children += @{ name = $g }
    }
    
    $jsonObj = @{
        name = "Root"
        children = @(
            @{
                name = "Genres"
                children = $children
            }
        )
    }
    $jsonObj | ConvertTo-Json -Depth 5 | Set-Content $mainJsonPath -Encoding UTF8

    [System.Windows.Forms.MessageBox]::Show("Merged data to MAIN Data folder!`n`nGenre Hierarchy JSON and Descriptors Reference CSV have been completely auto-generated from all your entered albums.", "Success")
})
$form.Controls.Add($btnMerge)

$form.ShowDialog() | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions

[System.Windows.Forms.Application]::EnableVisualStyles()

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataCsvPath = Join-Path $scriptRoot "..\Data\rym_clean1.csv"
$descriptorCsvPath = Join-Path $scriptRoot "..\Data\descriptors_reference.csv"
$hierarchyJsonPath = Join-Path $scriptRoot "..\Data\filtered_hierarchy.json"

foreach ($path in @($dataCsvPath, $descriptorCsvPath, $hierarchyJsonPath)) {
    if (-not (Test-Path $path)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Required file not found: $path`nPlease ensure required data files are in the Data folder.",
            "Missing File",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
        exit 1
    }
}

# Verify and add "listened" column if missing
$rawData = Get-Content $dataCsvPath -Raw
$lines = $rawData -split "`r?`n" | Where-Object { $_ }
if ($lines.Count -gt 0) {
    $headerLine = $lines[0]
    if ($headerLine -notmatch '"?listened"?') {
        # Add "listened" header to first line
        $newHeader = $headerLine + ",listened"
        $newLines = @($newHeader)
        $newLines += $lines | Select-Object -Skip 1 | ForEach-Object { $_ + ",0" }
        $newLines -join [Environment]::NewLine | Set-Content $dataCsvPath -Force
    }
}

$allAlbums = Import-Csv $dataCsvPath
$descriptorRows = Import-Csv $descriptorCsvPath
$rawJson = Get-Content $hierarchyJsonPath -Raw
$javaScriptSerializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$javaScriptSerializer.MaxJsonLength = 20971520
$hierarchyTree = $javaScriptSerializer.DeserializeObject($rawJson)

function Split-TagList {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -eq "NA") { return @() }
    return @($Value.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

$allDescriptors = @($descriptorRows.descriptor | Where-Object { $_ } | Sort-Object -Unique)
$script:descriptorStates = @{}
foreach ($d in $allDescriptors) { $script:descriptorStates[$d] = $true }

# Pre-process datasets for massive speed boost (O(1) Hash lookups)
$script:processedAlbums = New-Object System.Collections.Generic.List[psobject]
foreach ($album in $allAlbums) {
    $gList = @(Split-TagList $album.primary_genres) + @(Split-TagList $album.secondary_genres)
    $gSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$gList, [System.StringComparer]::OrdinalIgnoreCase)

    $dList = Split-TagList $album.descriptors
    $dSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$dList, [System.StringComparer]::OrdinalIgnoreCase)

    $album | Add-Member -MemberType NoteProperty -Name "_GenreSet" -Value $gSet -Force
    $album | Add-Member -MemberType NoteProperty -Name "_DescriptorSet" -Value $dSet -Force
    $album | Add-Member -MemberType ScriptMethod -Name "ToString" -Value { "$($this.artist_name) - $($this.release_name)" } -Force
    $script:processedAlbums.Add($album)
}

$displayNameMap = @{
    "release_name" = "Release Name"
    "artist_name" = "Artist"
    "release_date" = "Release Date"
    "release_type" = "Release Type"
    "primary_genres" = "Primary Genres"
    "secondary_genres" = "Secondary Genres"
    "descriptors" = "Descriptors"
}
$excludedColumns = @("H1", "position", "avg_rating", "rating_count", "review_count", "listened")

function Get-DescendantGenres {
    param([System.Windows.Forms.TreeNode]$Node)
    $list = New-Object System.Collections.Generic.List[string]
    if ($Node.Text -ne "Root" -and $Node.Text -ne "Genres" -and $Node.Text -ne "Any Genre") { $list.Add($Node.Text) }
    foreach ($child in $Node.Nodes) {
        $childGenres = Get-DescendantGenres -Node $child
        foreach ($g in $childGenres) { $list.Add($g) }
    }
    return $list
}

function Format-AlbumInfo {
    param([pscustomobject]$Album)
    if (-not $Album) { return "No album selected." }
    
    $title = "$($Album.release_name) - $($Album.artist_name)"
    $lines = New-Object System.Collections.Generic.List[string]
    $null = $lines.Add($title)
    $null = $lines.Add(("=" * [Math]::Max(20, $title.Length)))
    
    foreach ($property in $Album.PSObject.Properties) {
        $name = $property.Name
        if ($name.StartsWith("_") -or $excludedColumns -contains $name) { continue }
        $value = [string]$property.Value
        if ([string]::IsNullOrWhiteSpace($value) -or $value -eq "NA") { $value = "N/A" }
        $label = if ($displayNameMap.ContainsKey($name)) { $displayNameMap[$name] } else { ($name -replace "_", " ") }
        $null = $lines.Add("$label`: $value")
    }
    
    return ($lines -join [Environment]::NewLine)
}

# Main Form
$form = New-Object System.Windows.Forms.Form
$form.Text = "Random Album Generator v2"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(1400, 670)
$form.MinimumSize = New-Object System.Drawing.Size(1200, 670)
$form.BackColor = [System.Drawing.Color]::FromArgb(245, 247, 250)

# Left Panel - Filters
$leftPanel = New-Object System.Windows.Forms.Panel
$leftPanel.Location = New-Object System.Drawing.Point(15, 15)
$leftPanel.Size = New-Object System.Drawing.Size(440, 600)
$leftPanel.BackColor = [System.Drawing.Color]::White
$leftPanel.BorderStyle = "FixedSingle"
$form.Controls.Add($leftPanel)

# Right Panel - Album Details
$rightPanel = New-Object System.Windows.Forms.Panel
$rightPanel.Location = New-Object System.Drawing.Point(470, 15)
$rightPanel.Size = New-Object System.Drawing.Size(900, 600)
$rightPanel.BackColor = [System.Drawing.Color]::White
$rightPanel.BorderStyle = "FixedSingle"
$form.Controls.Add($rightPanel)

$fontHeader = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$fontBody = New-Object System.Drawing.Font("Segoe UI", 10)
$fontSmall = New-Object System.Drawing.Font("Segoe UI", 9)

# LEFT PANEL CONTROLS
$lblFilters = New-Object System.Windows.Forms.Label
$lblFilters.Text = "Filters & Search"
$lblFilters.Font = $fontHeader
$lblFilters.AutoSize = $true
$lblFilters.Location = New-Object System.Drawing.Point(15, 12)
$leftPanel.Controls.Add($lblFilters)

# Genre Tree (without search box)
$lblGenreTree = New-Object System.Windows.Forms.Label
$lblGenreTree.Text = "Genre Hierarchy"
$lblGenreTree.Font = $fontBody
$lblGenreTree.AutoSize = $true
$lblGenreTree.Location = New-Object System.Drawing.Point(15, 45)
$leftPanel.Controls.Add($lblGenreTree)

$treeGenres = New-Object System.Windows.Forms.TreeView
$treeGenres.Location = New-Object System.Drawing.Point(15, 65)
$treeGenres.Size = New-Object System.Drawing.Size(410, 200)
$treeGenres.Font = $fontSmall
$treeGenres.HideSelection = $false
$leftPanel.Controls.Add($treeGenres)

function Build-TreeView {
    param($UiNode, $DataNode)
    foreach ($child in $DataNode["children"]) {
        $newNode = New-Object System.Windows.Forms.TreeNode
        $newNode.Text = $child["name"]
        $null = $UiNode.Nodes.Add($newNode)
        Build-TreeView -UiNode $newNode -DataNode $child
    }
}

$rootNode = New-Object System.Windows.Forms.TreeNode
$rootNode.Text = "Any Genre"
$null = $treeGenres.Nodes.Add($rootNode)

if ($hierarchyTree["name"] -eq "Root" -and $hierarchyTree["children"].Count -gt 0) {
    if ($hierarchyTree["children"][0]["name"] -eq "Genres") {
        Build-TreeView -UiNode $rootNode -DataNode $hierarchyTree["children"][0]
    } else {
        Build-TreeView -UiNode $rootNode -DataNode $hierarchyTree
    }
}

$rootNode.Expand()
$treeGenres.SelectedNode = $rootNode

# Pre-Listened Toggle
$chkIncludeListened = New-Object System.Windows.Forms.CheckBox
$chkIncludeListened.Text = "Include Pre-Listened Albums"
$chkIncludeListened.Font = $fontSmall
$chkIncludeListened.AutoSize = $true
$chkIncludeListened.Location = New-Object System.Drawing.Point(15, 275)
$chkIncludeListened.Checked = $false
$leftPanel.Controls.Add($chkIncludeListened)

# Descriptors
$lblDescriptors = New-Object System.Windows.Forms.Label
$lblDescriptors.Text = "Descriptors"
$lblDescriptors.Font = $fontBody
$lblDescriptors.AutoSize = $true
$lblDescriptors.Location = New-Object System.Drawing.Point(15, 305)
$leftPanel.Controls.Add($lblDescriptors)

$lblSearchDescriptors = New-Object System.Windows.Forms.Label
$lblSearchDescriptors.Text = "Search:"
$lblSearchDescriptors.Font = $fontSmall
$lblSearchDescriptors.AutoSize = $true
$lblSearchDescriptors.Location = New-Object System.Drawing.Point(15, 330)
$leftPanel.Controls.Add($lblSearchDescriptors)

$txtSearchDescriptors = New-Object System.Windows.Forms.TextBox
$txtSearchDescriptors.Font = $fontBody
$txtSearchDescriptors.Location = New-Object System.Drawing.Point(75, 327)
$txtSearchDescriptors.Size = New-Object System.Drawing.Size(350, 25)
$leftPanel.Controls.Add($txtSearchDescriptors)

$btnSelectAll = New-Object System.Windows.Forms.Button
$btnSelectAll.Text = "Select All"
$btnSelectAll.Font = $fontSmall
$btnSelectAll.Location = New-Object System.Drawing.Point(15, 360)
$btnSelectAll.Size = New-Object System.Drawing.Size(205, 28)
$leftPanel.Controls.Add($btnSelectAll)

$btnDeselectAll = New-Object System.Windows.Forms.Button
$btnDeselectAll.Text = "Deselect All"
$btnDeselectAll.Font = $fontSmall
$btnDeselectAll.Location = New-Object System.Drawing.Point(220, 360)
$btnDeselectAll.Size = New-Object System.Drawing.Size(205, 28)
$leftPanel.Controls.Add($btnDeselectAll)

$descriptorList = New-Object System.Windows.Forms.CheckedListBox
$descriptorList.Font = $fontSmall
$descriptorList.Location = New-Object System.Drawing.Point(15, 395)
$descriptorList.Size = New-Object System.Drawing.Size(410, 120)
$descriptorList.CheckOnClick = $true
$leftPanel.Controls.Add($descriptorList)

# Random Button
$btnRandom = New-Object System.Windows.Forms.Button
$btnRandom.Text = "Pick Random Album"
$btnRandom.Font = $fontBody
$btnRandom.Location = New-Object System.Drawing.Point(15, 525)
$btnRandom.Size = New-Object System.Drawing.Size(205, 38)
$btnRandom.BackColor = [System.Drawing.Color]::FromArgb(39, 92, 140)
$btnRandom.ForeColor = [System.Drawing.Color]::White
$btnRandom.FlatStyle = "Flat"
$leftPanel.Controls.Add($btnRandom)

$btnClear = New-Object System.Windows.Forms.Button
$btnClear.Text = "Clear Filters"
$btnClear.Font = $fontBody
$btnClear.Location = New-Object System.Drawing.Point(220, 525)
$btnClear.Size = New-Object System.Drawing.Size(205, 38)
$btnClear.BackColor = [System.Drawing.Color]::FromArgb(224, 230, 235)
$btnClear.FlatStyle = "Flat"
$leftPanel.Controls.Add($btnClear)

$lblMatchCount = New-Object System.Windows.Forms.Label
$lblMatchCount.Font = $fontSmall
$lblMatchCount.AutoSize = $true
$lblMatchCount.Location = New-Object System.Drawing.Point(15, 570)
$lblMatchCount.Text = "Matched albums: 0"
$leftPanel.Controls.Add($lblMatchCount)

# RIGHT PANEL CONTROLS

# Album Search (at the top of right panel)
$lblAlbumSearch = New-Object System.Windows.Forms.Label
$lblAlbumSearch.Text = "Search Albums:"
$lblAlbumSearch.Font = $fontSmall
$lblAlbumSearch.AutoSize = $true
$lblAlbumSearch.Location = New-Object System.Drawing.Point(15, 12)
$rightPanel.Controls.Add($lblAlbumSearch)

$btnShowListened = New-Object System.Windows.Forms.Button
$btnShowListened.Text = "Show Checked/Listened"
$btnShowListened.Font = $fontSmall
$btnShowListened.Location = New-Object System.Drawing.Point(120, 8)
$btnShowListened.Size = New-Object System.Drawing.Size(160, 22)
$btnShowListened.BackColor = [System.Drawing.Color]::FromArgb(224, 230, 235)
$btnShowListened.FlatStyle = "Flat"
$rightPanel.Controls.Add($btnShowListened)

$txtAlbumSearch = New-Object System.Windows.Forms.TextBox
$txtAlbumSearch.Font = $fontBody
$txtAlbumSearch.Location = New-Object System.Drawing.Point(15, 32)
$txtAlbumSearch.Size = New-Object System.Drawing.Size(870, 25)
$rightPanel.Controls.Add($txtAlbumSearch)

$lstSearchResults = New-Object System.Windows.Forms.ListBox
$lstSearchResults.Font = $fontSmall
$lstSearchResults.Location = New-Object System.Drawing.Point(15, 62)
$lstSearchResults.Size = New-Object System.Drawing.Size(870, 80)
$rightPanel.Controls.Add($lstSearchResults)

# Album Details
$lblDetails = New-Object System.Windows.Forms.Label
$lblDetails.Text = "Album Details"
$lblDetails.Font = $fontHeader
$lblDetails.AutoSize = $true
$lblDetails.Location = New-Object System.Drawing.Point(15, 155)
$rightPanel.Controls.Add($lblDetails)

$txtAlbumDetails = New-Object System.Windows.Forms.TextBox
$txtAlbumDetails.Multiline = $true
$txtAlbumDetails.ReadOnly = $true
$txtAlbumDetails.ScrollBars = "Vertical"
$txtAlbumDetails.Font = New-Object System.Drawing.Font("Consolas", 10)
$txtAlbumDetails.Location = New-Object System.Drawing.Point(15, 185)
$txtAlbumDetails.Size = New-Object System.Drawing.Size(870, 330)
$txtAlbumDetails.BackColor = [System.Drawing.Color]::FromArgb(249, 250, 252)
$rightPanel.Controls.Add($txtAlbumDetails)

# Listened Checkbox
$chkListened = New-Object System.Windows.Forms.CheckBox
$chkListened.Text = "Listened to this album"
$chkListened.Font = $fontSmall
$chkListened.AutoSize = $true
$chkListened.Location = New-Object System.Drawing.Point(15, 530)
$rightPanel.Controls.Add($chkListened)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Font = $fontSmall
$lblStatus.AutoSize = $true
$lblStatus.Location = New-Object System.Drawing.Point(15, 560)
$lblStatus.Text = "Ready"
$lblStatus.ForeColor = [System.Drawing.Color]::Green
$rightPanel.Controls.Add($lblStatus)

# Script variables
$script:suppressDescriptorCheckEvent = $false
$script:currentAlbum = $null
$script:cachedValidGenres = $null
$script:lastSelectedNode = $null
$script:suppressListenedCheckEvent = $false

function Update-DescriptorList {
    param([string]$Filter = "")
    $descriptorList.BeginUpdate()
    $descriptorList.Items.Clear()
    foreach ($d in $allDescriptors) {
        if ([string]::IsNullOrWhiteSpace($Filter) -or $d.IndexOf($Filter, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $idx = $descriptorList.Items.Add($d)
            $descriptorList.SetItemChecked($idx, $script:descriptorStates[$d])
        }
    }
    $descriptorList.EndUpdate()
}

function Get-ValidGenresForNode($Node) {
    if ($Node -eq $script:lastSelectedNode -and $script:cachedValidGenres -ne $null) { return $script:cachedValidGenres }
    $validGenres = Get-DescendantGenres -Node $Node
    $set = [System.Collections.Generic.HashSet[string]]::new([string[]]@($validGenres), [System.StringComparer]::OrdinalIgnoreCase)
    $script:lastSelectedNode = $Node
    $script:cachedValidGenres = $set
    return $set
}

function Update-MatchCount {
    $selectedNode = $treeGenres.SelectedNode
    
    $validGenresSet = Get-ValidGenresForNode $selectedNode
    $isAnyGenre = (-not $selectedNode -or $selectedNode.Text -eq "Root" -or $selectedNode.Text -eq "Genres" -or $selectedNode.Text -eq "Any Genre")
    
    $selectedDescriptorsCount = 0
    $selectedDescriptorsSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($kvp in $script:descriptorStates.GetEnumerator()) {
        if ($kvp.Value) {
            $null = $selectedDescriptorsSet.Add($kvp.Name)
            $selectedDescriptorsCount++
        }
    }
    
    $isAllDescriptors = ($selectedDescriptorsCount -eq $allDescriptors.Count)
    $isNoDescriptors = ($selectedDescriptorsCount -eq 0)

    $matches = New-Object System.Collections.Generic.List[psobject]
    $includeListened = $chkIncludeListened.Checked

    foreach ($album in $script:processedAlbums) {
        # Check if listened status
        $isListened = ($album.listened -eq "1" -or $album.listened -eq 1 -or $album.listened -eq $true -or $album.listened -match "true")
        
        if (-not $includeListened -and $isListened) { continue }
        
        if (-not $isAnyGenre) {
            $gMatch = $false
            foreach ($g in $album._GenreSet) {
                if ($validGenresSet.Contains($g)) { $gMatch = $true; break }
            }
            if (-not $gMatch) { continue }
        }

        if (-not $isAllDescriptors) {
            if ($isNoDescriptors) { continue }
            $dMatch = $false
            foreach ($d in $album._DescriptorSet) {
                if ($selectedDescriptorsSet.Contains($d)) { $dMatch = $true; break }
            }
            if (-not $dMatch) { continue }
        }

        $matches.Add($album)
    }

    $lblMatchCount.Text = "Matched albums: $($matches.Count)"
    return $matches
}

function Update-AlbumDisplay {
    if (-not $script:currentAlbum) {
        $txtAlbumDetails.Text = "No album selected."
        $script:suppressListenedCheckEvent = $true
        $chkListened.Checked = $false
        $script:suppressListenedCheckEvent = $false
        return
    }
    
    $txtAlbumDetails.Text = Format-AlbumInfo -Album $script:currentAlbum
    
    $script:suppressListenedCheckEvent = $true
    $chkListened.Checked = ($script:currentAlbum.listened -eq "1" -or $script:currentAlbum.listened -eq 1 -or $script:currentAlbum.listened -eq $true -or $script:currentAlbum.listened -match "true")
    $script:suppressListenedCheckEvent = $false
}

function Search-Albums {
    param([string]$Query)
    $lstSearchResults.Items.Clear()
    
    if ([string]::IsNullOrWhiteSpace($Query)) { return }
    
    $query = $Query.ToLower()
    foreach ($album in $script:processedAlbums) {
        if ($album.artist_name.ToLower().Contains($query) -or $album.release_name.ToLower().Contains($query)) {
            $lstSearchResults.Items.Add($album) | Out-Null
        }
    }
}

function Save-ListenedStatus {
    $allAlbums | Select-Object -Property * -ExcludeProperty "_GenreSet", "_DescriptorSet" | Export-Csv -Path $dataCsvPath -NoTypeInformation -Force
}

# Event Handlers
$treeGenres.Add_AfterSelect({ Update-MatchCount | Out-Null })

$descriptorList.Add_ItemCheck({
    if ($script:suppressDescriptorCheckEvent) { return }
    $item = [string]$descriptorList.Items[$_.Index]
    $script:descriptorStates[$item] = ($_.NewValue -eq [System.Windows.Forms.CheckState]::Checked)
    $form.BeginInvoke([Action]{ Update-MatchCount | Out-Null }) | Out-Null
})

$txtSearchDescriptors.Add_TextChanged({
    $script:suppressDescriptorCheckEvent = $true
    Update-DescriptorList -Filter $txtSearchDescriptors.Text
    $script:suppressDescriptorCheckEvent = $false
})

$txtAlbumSearch.Add_TextChanged({
    Search-Albums -Query $txtAlbumSearch.Text
})

$btnShowListened.Add_Click({
    $lstSearchResults.Items.Clear()
    foreach ($album in $script:processedAlbums) {
        $isListened = ($album.listened -eq "1" -or $album.listened -eq 1 -or $album.listened -eq $true -or $album.listened -match "true")
        if ($isListened) {
            $lstSearchResults.Items.Add($album) | Out-Null
        }
    }
})

$lstSearchResults.Add_DoubleClick({
    if ($lstSearchResults.SelectedIndex -ge 0) {
        $script:currentAlbum = $lstSearchResults.SelectedItem
        Update-AlbumDisplay
        $txtAlbumSearch.Text = ""
    }
})

$chkIncludeListened.Add_CheckedChanged({
    Update-MatchCount | Out-Null
})

$chkListened.Add_CheckedChanged({
    if ($script:suppressListenedCheckEvent -or -not $script:currentAlbum) { return }
    
    $script:currentAlbum.listened = if ($chkListened.Checked) { "1" } else { "0" }
    Save-ListenedStatus
    $lblStatus.Text = "Album $(if ($chkListened.Checked) { 'marked as listened' } else { 'marked as not listened' })"
    $lblStatus.ForeColor = [System.Drawing.Color]::Green

    # Update pool instantly if Pre-Listened is toggled off and active track changes
    if (-not $chkIncludeListened.Checked) {
        Update-MatchCount | Out-Null
    }
})

$btnSelectAll.Add_Click({
    $script:suppressDescriptorCheckEvent = $true
    foreach ($k in @($script:descriptorStates.Keys)) { $script:descriptorStates[$k] = $true }
    Update-DescriptorList -Filter $txtSearchDescriptors.Text
    $script:suppressDescriptorCheckEvent = $false
    Update-MatchCount | Out-Null
})

$btnDeselectAll.Add_Click({
    $script:suppressDescriptorCheckEvent = $true
    foreach ($k in @($script:descriptorStates.Keys)) { $script:descriptorStates[$k] = $false }
    Update-DescriptorList -Filter $txtSearchDescriptors.Text
    $script:suppressDescriptorCheckEvent = $false
    Update-MatchCount | Out-Null
})

$btnClear.Add_Click({
    $script:suppressDescriptorCheckEvent = $true
    $treeGenres.SelectedNode = $rootNode
    foreach ($k in @($script:descriptorStates.Keys)) { $script:descriptorStates[$k] = $true }
    $txtSearchDescriptors.Text = ""
    $txtAlbumSearch.Text = ""
    Update-DescriptorList
    $script:suppressDescriptorCheckEvent = $false
    $txtAlbumDetails.Text = "Filters reset. Click 'Pick Random Album' to select a match."
    $chkIncludeListened.Checked = $false
    Update-MatchCount | Out-Null
})

$btnRandom.Add_Click({
    $matches = Update-MatchCount
    if ($matches.Count -eq 0) {
        $txtAlbumDetails.Text = "No albums matched the selected filters."
        $script:currentAlbum = $null
        $script:suppressListenedCheckEvent = $true
        $chkListened.Checked = $false
        $script:suppressListenedCheckEvent = $false
        return
    }
    $script:currentAlbum = Get-Random -InputObject $matches
    Update-AlbumDisplay
})


# Initialize
$script:suppressDescriptorCheckEvent = $true
Update-DescriptorList
$script:suppressDescriptorCheckEvent = $false

Update-MatchCount | Out-Null
$txtAlbumDetails.Text = "Choose filters and click 'Pick Random Album' or search for an album."

[void]$form.ShowDialog()

$dataDir = Join-Path -Path $PSScriptRoot -ChildPath "..\Data\Staging"

if (-not (Test-Path -Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
}

$rymCsvPath = Join-Path -Path $dataDir -ChildPath "rym_clean1.csv"
$descCsvPath = Join-Path -Path $dataDir -ChildPath "descriptors_reference.csv"
$jsonPath = Join-Path -Path $dataDir -ChildPath "filtered_hierarchy.json"

# Create rym_clean1.csv
$rymCsvContent = @"
"H1","position","release_name","artist_name","release_date","release_type","primary_genres","secondary_genres","descriptors","avg_rating","rating_count","review_count","listened"
"1","1","Sample Album 1","The Mockers","2023-01-01","album","Alternative Rock, Indie Rock","Pop","melancholic, malevocals, atmospheric","4.00","1000","50","0"
"2","2","Beats in Space","DJ Fake","2021-05-12","album","Electronic, House","Techno","upbeat, futuristic, energetic","3.80","500","20","0"
"3","3","Jazz For Coding","The Algo Trio","1965-03-20","album","Jazz, Cool Jazz","Bebop","instrumental, calm, intricate","4.50","2000","150","0"
"@
Set-Content -Path $rymCsvPath -Value $rymCsvContent -Encoding UTF8
Write-Host "Created sample rym_clean1.csv" -ForegroundColor Green

# Create descriptors_reference.csv
$descCsvContent = @"
descriptor,count
melancholic,100
malevocals,80
atmospheric,70
upbeat,60
futuristic,50
energetic,40
instrumental,90
calm,30
intricate,20
"@
Set-Content -Path $descCsvPath -Value $descCsvContent -Encoding UTF8
Write-Host "Created sample descriptors_reference.csv" -ForegroundColor Green

# Create filtered_hierarchy.json
$jsonContent = @"
{
  "name": "Root",
  "children": [
    {
      "name": "Genres",
      "children": [
        {
          "name": "Alternative Rock"
        },
        {
          "name": "Electronic"
        },
        {
          "name": "Jazz"
        }
      ]
    }
  ]
}
"@
Set-Content -Path $jsonPath -Value $jsonContent -Encoding UTF8
Write-Host "Created sample filtered_hierarchy.json" -ForegroundColor Green

Write-Host "All set! You can now use the generator to view the sample data." -ForegroundColor Cyan

<#
Validates the Q3 2026 existing-sites commission output against the Deliveroo contract.
(Q3 sibling of Validate-Q2ExistingSites.ps1 — Q2 left untouched as history.)

Q3 file differences vs Q2 (handled here):
  * Site / Brand columns arrive BLANK (only Restaurant ID identifies a menu) -> we
    backfill the Site name from the Q2 commission output's Restaurant ID -> Site map,
    then from the Roo Hub registry reference (reference/deliveroo_id_name_map.csv,
    refresh with: node scripts/build_id_name_map.js). Restaurants with no name in
    either source are written to a separate _UNNAMED CSV.
  * New "AOV" (raw) + "AOV Adjustment" columns. AOV Adjustment is included in the
    arithmetic sum (New Commission = Headline + RWT + OrderInacc + OpenHours + JBP + AOV).
  * New raw operational metric columns (RWT, Order Inaccuracy, Opening Hours as decimals)
    are carried through to the by-site output to feed the forward-looking "at-risk" view.

For each row it checks:
  1. Headline Commission is one of the 9 contracted banded rates.
  2. Each PfP adjustment (RWT / Order Inaccuracy / Opening Hours / JBP / AOV) is a value
     permitted by the contract's adjustment bands.
  3. New Commission == Headline + (RWT + OrderInacc + OpenHours + JBP + AOV)  [arithmetic].
  4. Total Commission Change == sum of the adjustments.
Outputs:
  - row-level findings CSV (only flagged rows)
  - per-site summary CSV (with raw ops metrics + resolved Site name)
  - unnamed-restaurant CSV (new-since-Q2 IDs with no name)
  - prints a console summary
#>

param(
  [string]$InputCsv = "$PSScriptRoot\..\03_source-data\Q3_existing-sites_commission_output_2026-07-01.csv",
  [string]$NameMapCsv = "$PSScriptRoot\..\03_source-data\Q2_existing-sites_commission_output_2026-04-08.csv",
  [string]$HubMapCsv  = "$PSScriptRoot\..\reference\deliveroo_id_name_map.csv",
  [string]$OutDir   = "$PSScriptRoot\..\04_analysis"
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

# --- Contract-permitted values (percentage points) ---
$HEADLINE = @(32.59,31.59,30.00,28.78,27.82,27.04,26.40,25.86,25.62)
$RWT      = @(-2.00,-1.80,-1.60,-1.40,-1.20,-1.00,-0.80,-0.60,-0.40,-0.20,0.00,0.20,0.40,0.60,0.80)
$MISSING  = @(-2.40,-2.20,-2.00,-1.80,-1.60,-1.40,-1.20,-1.00,-0.80,-0.60,-0.40,-0.20,0.00,0.20,0.40,0.60,0.80,1.00,1.20,1.40,1.60)
$OPENHRS  = @(-1.20,-1.00,-0.80,-0.60,-0.40,-0.20,0.00)
$JBP      = @(-0.50,0.00)
$AOVADJ   = @(0.00)   # new column; contract defines no AOV adjustment, so only 0.00 is expected
$TOL = 0.01   # rounding tolerance in % points

function In($val,$set){ ($set | Where-Object { [math]::Abs($_ - $val) -lt $TOL }).Count -gt 0 }
function Pct([string]$s){ [double]($s -replace '%','' -replace ',','') }

# --- Restaurant ID -> Site name map, from the Q2 commission output (which had names) ---
$idToName = @{}
if (Test-Path $NameMapCsv) {
  foreach ($r in Import-Csv $NameMapCsv) {
    $id = ($r.'Restaurant ID').Trim()
    if ($id -and -not $idToName.ContainsKey($id) -and ($r.Site).Trim()) { $idToName[$id] = ($r.Site).Trim() }
  }
}
Write-Host ("Name map loaded: {0} Restaurant IDs -> Site names (from Q2 output)" -f $idToName.Count)

# --- Fallback: Roo Hub registry map (BigQuery export; node scripts/build_id_name_map.js) ---
# Only fills IDs the Q2 map doesn't cover, so established sites keep their statement spelling.
$hubAdded = 0
if (Test-Path $HubMapCsv) {
  foreach ($r in Import-Csv $HubMapCsv) {
    $id = ($r.restaurant_id).Trim()
    if ($id -and -not $idToName.ContainsKey($id) -and ($r.name).Trim()) { $idToName[$id] = ($r.name).Trim(); $hubAdded++ }
  }
}
Write-Host ("Hub registry map: {0} additional IDs named (from {1})" -f $hubAdded, (Split-Path $HubMapCsv -Leaf))

$rows = Import-Csv $InputCsv
$findings = New-Object System.Collections.Generic.List[object]
$unnamed  = New-Object System.Collections.Generic.List[object]
$siteAgg  = @{}
$unnamedIds = @{}

foreach ($r in $rows) {
  $id = ($r.'Restaurant ID').Trim()
  # resolve site name: use file's Site if present, else backfill from Q2 map, else placeholder
  $site = ($r.Site).Trim()
  if (-not $site) { if ($idToName.ContainsKey($id)) { $site = $idToName[$id] } else { $site = "ID $id (unnamed)" } }
  $named = $idToName.ContainsKey($id) -or (($r.Site).Trim().Length -gt 0)

  $head = Pct $r.'Headline Commission'
  $new  = Pct $r.'New Commission'
  $tcc  = Pct $r.'Total Commission Change'
  $rwt  = [double]$r.'RWT Adjustment'
  $oia  = [double]$r.'Order Inaccuracy Adjustment'
  $oh   = [double]$r.'Opening Hours Adjustment'
  $jbp  = [double]$r.'JBP Discount'
  $aov  = [double]$r.'AOV Adjustment'
  $sumAdj = $rwt + $oia + $oh + $jbp + $aov
  $expNew = $head + $sumAdj

  # raw operational metrics (decimals in file -> keep as-is; blank -> $null)
  $rawRWT = if ($r.'RWT' -ne $null -and $r.'RWT' -ne '') { [double]$r.'RWT' } else { $null }
  $rawOIA = if ($r.'Order Inaccuracy' -ne $null -and $r.'Order Inaccuracy' -ne '') { [double]$r.'Order Inaccuracy' } else { $null }
  $rawOH  = if ($r.'Opening Hours' -ne $null -and $r.'Opening Hours' -ne '') { [double]$r.'Opening Hours' } else { $null }
  $rawAOV = if ($r.'AOV' -ne $null -and $r.'AOV' -ne '') { [double]$r.'AOV' } else { $null }

  $issues = @()
  if (-not (In $head $HEADLINE)) { $issues += "Headline $head not a contracted band rate" }
  if (-not (In $rwt  $RWT))      { $issues += "RWT $rwt outside contract bands" }
  if (-not (In $oia  $MISSING))  { $issues += "OrderInaccuracy $oia outside contract bands" }
  if (-not (In $oh   $OPENHRS))  { $issues += "OpenHours $oh outside contract bands" }
  if (-not (In $jbp  $JBP))      { $issues += "JBP $jbp not -0.50 or 0" }
  if (-not (In $aov  $AOVADJ))   { $issues += "AOV adj $aov not 0 (unexpected - no AOV adjustment in contract)" }
  if ([math]::Abs($new - $expNew) -gt $TOL) { $issues += ("New $new != Headline+adj {0:N2}" -f $expNew) }
  if ([math]::Abs([math]::Abs($tcc) - [math]::Abs($sumAdj)) -gt $TOL) { $issues += ("TotalChange $tcc != sumAdj {0:N2}" -f $sumAdj) }

  if ($issues.Count -gt 0) {
    $findings.Add([pscustomobject]@{
      Site=$site; RestaurantID=$id; Named=$named; Headline=$head; New=$new
      RWT=$rwt; OrderInacc=$oia; OpenHours=$oh; JBP=$jbp; AOV=$aov
      ExpectedNew=[math]::Round($expNew,2); Issues=($issues -join '; ')
    })
  }

  # per-site profile (adjustments are constant across the 9 brackets for a site)
  if (-not $siteAgg.ContainsKey($id)) {
    $siteAgg[$id] = [pscustomobject]@{
      Site=$site; RestaurantID=$id; Named=$named
      RWT=$rwt; OrderInacc=$oia; OpenHours=$oh; JBP=$jbp; AOV=$aov
      NetAdjustment=[math]::Round($sumAdj,2)
      RateIncreased=($sumAdj -gt $TOL)
      # raw operational metrics as percentages (for the at-risk / trending view)
      Raw_RWT_pct=$(if ($rawRWT -ne $null) { [math]::Round($rawRWT*100,3) } else { '' })
      Raw_OrderInacc_pct=$(if ($rawOIA -ne $null) { [math]::Round($rawOIA*100,3) } else { '' })
      Raw_OpenHours_pct=$(if ($rawOH -ne $null) { [math]::Round($rawOH*100,3) } else { '' })
      Raw_AOV=$(if ($rawAOV -ne $null) { $rawAOV } else { '' })
      'Eff_<12'=[math]::Round(32.59+$sumAdj,2);   'Eff_12-14'=[math]::Round(31.59+$sumAdj,2)
      'Eff_14-16'=[math]::Round(30.00+$sumAdj,2); 'Eff_16-18'=[math]::Round(28.78+$sumAdj,2)
      'Eff_18-20'=[math]::Round(27.82+$sumAdj,2); 'Eff_20-22'=[math]::Round(27.04+$sumAdj,2)
      'Eff_22-24'=[math]::Round(26.40+$sumAdj,2); 'Eff_24-26'=[math]::Round(25.86+$sumAdj,2)
      'Eff_26+'=[math]::Round(25.62+$sumAdj,2)
      Rows=0; FlaggedRows=0
    }
  }
  $siteAgg[$id].Rows++
  if ($issues.Count -gt 0) { $siteAgg[$id].FlaggedRows++ }

  if (-not $named -and -not $unnamedIds.ContainsKey($id)) {
    $unnamedIds[$id] = $true
    $unnamed.Add([pscustomobject]@{
      RestaurantID=$id; NetAdjustment=[math]::Round($sumAdj,2)
      Raw_RWT_pct=$(if ($rawRWT -ne $null) { [math]::Round($rawRWT*100,3) } else { '' })
      Raw_OrderInacc_pct=$(if ($rawOIA -ne $null) { [math]::Round($rawOIA*100,3) } else { '' })
      Raw_OpenHours_pct=$(if ($rawOH -ne $null) { [math]::Round($rawOH*100,3) } else { '' })
      Note='No Site name in Q3 file, Q2 map, or Hub registry map; refresh reference with node scripts/build_id_name_map.js'
    })
  }
}

$findingsPath = Join-Path $OutDir 'Q3_existing-sites_FINDINGS.csv'
$sitePath     = Join-Path $OutDir 'Q3_existing-sites_BY-SITE.csv'
$unnamedPath  = Join-Path $OutDir 'Q3_existing-sites_UNNAMED.csv'
$findings | Export-Csv -Path $findingsPath -NoTypeInformation -Encoding UTF8
$siteAgg.Values | Sort-Object Site | Export-Csv -Path $sitePath -NoTypeInformation -Encoding UTF8
$unnamed | Sort-Object RestaurantID | Export-Csv -Path $unnamedPath -NoTypeInformation -Encoding UTF8

$namedSites = ($siteAgg.Values | Where-Object {$_.Named}).Count
Write-Host "================ Q3 EXISTING-SITES VALIDATION ================"
Write-Host ("Rows checked          : {0}" -f $rows.Count)
Write-Host ("Unique restaurants    : {0}" -f $siteAgg.Count)
Write-Host ("  named (Q2 map + Hub) : {0}" -f $namedSites)
Write-Host ("  UNNAMED (no source)  : {0}" -f ($siteAgg.Count - $namedSites))
Write-Host ("Rows with issues      : {0}" -f $findings.Count)
Write-Host ("Sites with issues     : {0}" -f (($siteAgg.Values | Where-Object {$_.FlaggedRows -gt 0}).Count))
Write-Host ""
Write-Host ("Sites where rate INCREASED vs headline (net penalty): {0}" -f (($siteAgg.Values | Where-Object {$_.RateIncreased}).Count))
Write-Host ""
Write-Host "Distribution of net per-site adjustment (% points):"
$siteAgg.Values | Group-Object NetAdjustment | Sort-Object {[double]$_.Name} |
  ForEach-Object { Write-Host ("  {0,6}%  x {1} sites" -f $_.Name, $_.Count) }
Write-Host ""
Write-Host "Findings CSV : $findingsPath"
Write-Host "By-site  CSV : $sitePath"
Write-Host "Unnamed  CSV : $unnamedPath"

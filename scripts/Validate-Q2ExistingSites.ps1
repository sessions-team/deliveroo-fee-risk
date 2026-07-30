<#
Validates the Q2 2026 existing-sites commission output against the Deliveroo contract.

For each row it checks:
  1. Headline Commission is one of the 9 contracted banded rates.
  2. Each PfP adjustment (RWT / Order Inaccuracy / Opening Hours / JBP) is a value
     permitted by the contract's adjustment bands.
  3. New Commission == Headline + (RWT + OrderInacc + OpenHours + JBP)  [arithmetic].
  4. Total Commission Change == sum of the four adjustments.
Outputs:
  - row-level findings CSV (only flagged rows)
  - per-site summary CSV
  - prints a console summary
#>

param(
  [string]$InputCsv = "$PSScriptRoot\..\03_source-data\Q2_existing-sites_commission_output_2026-04-08.csv",
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
$TOL = 0.01   # rounding tolerance in % points

function In($val,$set){ ($set | Where-Object { [math]::Abs($_ - $val) -lt $TOL }).Count -gt 0 }
function Pct([string]$s){ [double]($s -replace '%','' -replace ',','') }

$rows = Import-Csv $InputCsv
$findings = New-Object System.Collections.Generic.List[object]
$siteAgg  = @{}

foreach ($r in $rows) {
  $head = Pct $r.'Headline Commission'
  $new  = Pct $r.'New Commission'
  $tcc  = Pct $r.'Total Commission Change'
  $rwt  = [double]$r.'RWT Adjustment'
  $oia  = [double]$r.'Order Inaccuracy Adjustment'
  $oh   = [double]$r.'Opening Hours Adjustment'
  $jbp  = [double]$r.'JBP Discount'
  $sumAdj = $rwt + $oia + $oh + $jbp
  $expNew = $head + $sumAdj

  $issues = @()
  if (-not (In $head $HEADLINE)) { $issues += "Headline $head not a contracted band rate" }
  if (-not (In $rwt  $RWT))      { $issues += "RWT $rwt outside contract bands" }
  if (-not (In $oia  $MISSING))  { $issues += "OrderInaccuracy $oia outside contract bands" }
  if (-not (In $oh   $OPENHRS))  { $issues += "OpenHours $oh outside contract bands" }
  if (-not (In $jbp  $JBP))      { $issues += "JBP $jbp not -0.50 or 0" }
  if ([math]::Abs($new - $expNew) -gt $TOL) { $issues += ("New $new != Headline+adj {0:N2}" -f $expNew) }
  if ([math]::Abs([math]::Abs($tcc) - [math]::Abs($sumAdj)) -gt $TOL) { $issues += ("TotalChange $tcc != sumAdj {0:N2}" -f $sumAdj) }

  if ($issues.Count -gt 0) {
    $findings.Add([pscustomobject]@{
      Site=$r.Site; RestaurantID=$r.'Restaurant ID'; Headline=$head; New=$new
      RWT=$rwt; OrderInacc=$oia; OpenHours=$oh; JBP=$jbp
      ExpectedNew=[math]::Round($expNew,2); Issues=($issues -join '; ')
    })
  }

  # per-site profile (adjustments are constant across the 9 brackets)
  if (-not $siteAgg.ContainsKey($r.Site)) {
    $siteAgg[$r.Site] = [pscustomobject]@{
      Site=$r.Site; RestaurantID=$r.'Restaurant ID'
      RWT=$rwt; OrderInacc=$oia; OpenHours=$oh; JBP=$jbp
      NetAdjustment=[math]::Round($sumAdj,2)
      RateIncreased=($sumAdj -gt $TOL)
      'Eff_<12'=[math]::Round(32.59+$sumAdj,2);   'Eff_12-14'=[math]::Round(31.59+$sumAdj,2)
      'Eff_14-16'=[math]::Round(30.00+$sumAdj,2); 'Eff_16-18'=[math]::Round(28.78+$sumAdj,2)
      'Eff_18-20'=[math]::Round(27.82+$sumAdj,2); 'Eff_20-22'=[math]::Round(27.04+$sumAdj,2)
      'Eff_22-24'=[math]::Round(26.40+$sumAdj,2); 'Eff_24-26'=[math]::Round(25.86+$sumAdj,2)
      'Eff_26+'=[math]::Round(25.62+$sumAdj,2)
      Rows=0; FlaggedRows=0
    }
  }
  $siteAgg[$r.Site].Rows++
  if ($issues.Count -gt 0) { $siteAgg[$r.Site].FlaggedRows++ }
}

$findingsPath = Join-Path $OutDir 'Q2_existing-sites_FINDINGS.csv'
$sitePath     = Join-Path $OutDir 'Q2_existing-sites_BY-SITE.csv'
$findings | Export-Csv -Path $findingsPath -NoTypeInformation -Encoding UTF8
$siteAgg.Values | Sort-Object Site | Export-Csv -Path $sitePath -NoTypeInformation -Encoding UTF8

Write-Host "================ Q2 EXISTING-SITES VALIDATION ================"
Write-Host ("Rows checked      : {0}" -f $rows.Count)
Write-Host ("Unique sites      : {0}" -f $siteAgg.Count)
Write-Host ("Rows with issues  : {0}" -f $findings.Count)
Write-Host ("Sites with issues : {0}" -f (($siteAgg.Values | Where-Object {$_.FlaggedRows -gt 0}).Count))
Write-Host ""
Write-Host ("Sites where rate INCREASED vs headline (net penalty): {0}" -f (($siteAgg.Values | Where-Object {$_.RateIncreased}).Count))
Write-Host ""
Write-Host "Distribution of net per-site adjustment (% points):"
$siteAgg.Values | Group-Object NetAdjustment | Sort-Object {[double]$_.Name} |
  ForEach-Object { Write-Host ("  {0,6}%  x {1} sites" -f $_.Name, $_.Count) }
Write-Host ""
Write-Host "Findings CSV : $findingsPath"
Write-Host "By-site  CSV : $sitePath"

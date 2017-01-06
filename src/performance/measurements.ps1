# number of experiments for subsequent avering out
$runs = 20;

# max points in convex hull;
# n = 10 => hull with 3, 4, ...,12 points will be considered in one experiment
# min = 0, max = 198
$n = 198;

$scriptpath = $MyInvocation.MyCommand.Path
$dir = Split-Path $scriptpath
$script = "$dir\profile.js"

for ($run = 0; $run -lt $runs; $run++) {
    $log = $dir + "\log_" + $run + ".txt"
    Write-Host $log

    if (Test-Path $log) {
       Write-Host "Old log removed"
	   Remove-Item $log
    }

    $stream = [System.IO.StreamWriter] $log

    for ($i = 0; $i -lt $n; $i++){
        if ($i % 10 -eq 0) { Write-Host $i/$n }
        $m = Measure-Command { node $script $i }
        $ms = $m.Milliseconds
        $stream.WriteLine("$i $ms")
    }
    $stream.close()
}
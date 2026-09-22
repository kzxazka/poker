param(
    [string]$msg = "update poker scoreboard"
)

$gitDir = "C:\Users\Azka\poker_repo\.git"
$workTree = "D:\OneDrive\Documents\POKER"

Write-Host "Adding changes from $workTree..."
git --git-dir=$gitDir --work-tree=$workTree add -A

Write-Host "Committing with message: '$msg'..."
git --git-dir=$gitDir --work-tree=$workTree commit -m $msg

Write-Host "Pushing to origin main..."
git --git-dir=$gitDir --work-tree=$workTree push origin main

Write-Host "Done!" -ForegroundColor Green

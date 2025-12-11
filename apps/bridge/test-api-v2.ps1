# Dead Drop API v2 Test Suite
# Tests all endpoints of the new Clean Architecture

$BaseUrl = "http://localhost:4000"
$ErrorCount = 0
$SuccessCount = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method = "GET",
        [string]$Path,
        [hashtable]$Headers = @{},
        [string]$Body = $null
    )
    
    Write-Host "`n[$Name]" -ForegroundColor Cyan
    Write-Host "  $Method $Path" -ForegroundColor Gray
    
    try {
        $url = "$BaseUrl$Path"
        $curlArgs = @("-s", "-X", $Method, $url)
        
        foreach ($key in $Headers.Keys) {
            $curlArgs += "-H"
            $curlArgs += "$key`: $($Headers[$key])"
        }
        
        if ($Body) {
            $curlArgs += "-d"
            $curlArgs += $Body
        }
        
        $response = & curl.exe @curlArgs | ConvertFrom-Json
        
        if ($response.error) {
            Write-Host "  ❌ FAILED: $($response.error) - $($response.message)" -ForegroundColor Red
            $script:ErrorCount++
        } else {
            Write-Host "  ✅ SUCCESS" -ForegroundColor Green
            $response | ConvertTo-Json -Depth 3 -Compress | Write-Host -ForegroundColor DarkGray
            $script:SuccessCount++
        }
        
        return $response
    } catch {
        Write-Host "  ❌ EXCEPTION: $_" -ForegroundColor Red
        $script:ErrorCount++
        return $null
    }
}

Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  Dead Drop API v2 - Test Suite" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

# Test 1: Health Check
$health = Test-Endpoint -Name "Health Check" -Path "/health-v2"

# Test 2: Login User 1 (using existing account)
Write-Host "`n[Login User 1]" -ForegroundColor Cyan
$loginResponse = curl.exe -s -X POST "$BaseUrl/api/v2/auth/login" -H "Content-Type: application/json" -d "@test-login.json" | ConvertFrom-Json
if ($loginResponse.accessToken) {
    Write-Host "  ✅ SUCCESS" -ForegroundColor Green
    $token1 = $loginResponse.accessToken
    $script:SuccessCount++
} else {
    Write-Host "  ❌ FAILED: $($loginResponse.error)" -ForegroundColor Red
    $script:ErrorCount++
}

# Test 5: Create Conversation
if ($token1) {
    $conv = Test-Endpoint `
        -Name "Create Conversation" `
        -Method "POST" `
        -Path "/api/v2/conversations" `
        -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer $token1"} `
        -Body '{"targetUsername":"alice2025"}'
    
    if ($conv) {
        $convId = $conv.id
    }
}

# Test 6: List Conversations
if ($token1) {
    Test-Endpoint `
        -Name "List Conversations" `
        -Path "/api/v2/conversations" `
        -Headers @{"Authorization"="Bearer $token1"}
}

# Test 7: Get Conversation by ID
if ($token1 -and $convId) {
    Test-Endpoint `
        -Name "Get Conversation" `
        -Path "/api/v2/conversations/$convId" `
        -Headers @{"Authorization"="Bearer $token1"}
}

# Test 8: Send Message
if ($token1 -and $convId) {
    Test-Endpoint `
        -Name "Send Message" `
        -Method "POST" `
        -Path "/api/v2/messages" `
        -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer $token1"} `
        -Body "{`"conversationId`":`"$convId`",`"body`":`"Hello from Clean Architecture!`"}"
}

# Test 9: List Messages
if ($token1 -and $convId) {
    Test-Endpoint `
        -Name "List Messages" `
        -Path "/api/v2/messages?conversationId=$convId" `
        -Headers @{"Authorization"="Bearer $token1"}
}

# Summary
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "  Test Summary" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  ✅ Passed: $SuccessCount" -ForegroundColor Green
Write-Host "  ❌ Failed: $ErrorCount" -ForegroundColor Red
Write-Host "  Total: $($SuccessCount + $ErrorCount)" -ForegroundColor Cyan

if ($ErrorCount -eq 0) {
    Write-Host "`n🎉 All tests passed!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Some tests failed" -ForegroundColor Yellow
}

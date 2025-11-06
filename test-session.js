const SessionManager = require('./services/SessionManager');
const path = require('path');

async function testSessionManager() {
  const sessionManager = new SessionManager();
  
  try {
    console.log('Testing SessionManager...\n');

    // Test 1: Check initial status (should be no active session)
    console.log('1. Checking initial status...');
    const initialStatus = await sessionManager.getSessionStatus();
    console.log('Initial status:', initialStatus);
    console.log('Is session active?', await sessionManager.isSessionActive());

    // Test 2: Start a session
    console.log('\n2. Starting session...');
    const startResult = await sessionManager.startSession(process.cwd());
    console.log('Start result:', startResult);

    // Test 3: Check status after starting
    console.log('\n3. Checking status after start...');
    const activeStatus = await sessionManager.getSessionStatus();
    console.log('Active status:', activeStatus);

    // Test 4: Try to start another session (should fail)
    console.log('\n4. Trying to start another session (should fail)...');
    try {
      await sessionManager.startSession(process.cwd());
    } catch (error) {
      console.log('Expected error:', error.message);
    }

    // Test 5: Stop the session
    console.log('\n5. Stopping session...');
    const stopResult = await sessionManager.stopSession();
    console.log('Stop result:', stopResult);

    // Test 6: Check status after stopping
    console.log('\n6. Checking status after stop...');
    const finalStatus = await sessionManager.getSessionStatus();
    console.log('Final status:', finalStatus);

    // Test 7: Try to stop again (should indicate no active session)
    console.log('\n7. Trying to stop again (should indicate no active session)...');
    const stopAgainResult = await sessionManager.stopSession();
    console.log('Stop again result:', stopAgainResult);

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await sessionManager.cleanup();
  }
}

testSessionManager();
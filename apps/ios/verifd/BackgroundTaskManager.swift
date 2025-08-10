import UIKit
import BackgroundTasks

/// Handles background purge operations
/// Ensures expired passes are cleaned up even when app is backgrounded
class BackgroundTaskManager {
    static let shared = BackgroundTaskManager()
    private let backgroundTaskIdentifier = "com.verifd.app.purge"
    
    private init() {}
    
    func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: backgroundTaskIdentifier, using: nil) { task in
            self.handleBackgroundPurge(task: task as! BGAppRefreshTask)
        }
    }
    
    func scheduleBackgroundPurge() {
        let request = BGAppRefreshTaskRequest(identifier: backgroundTaskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 4 * 60 * 60) // 4 hours from now
        
        try? BGTaskScheduler.shared.submit(request)
    }
    
    private func handleBackgroundPurge(task: BGAppRefreshTask) {
        // Schedule the next background purge
        scheduleBackgroundPurge()
        
        let operation = PurgeOperation()
        
        task.expirationHandler = {
            operation.cancel()
        }
        
        operation.completionBlock = {
            task.setTaskCompleted(success: !operation.isCancelled)
        }
        
        OperationQueue().addOperation(operation)
    }
}

/// Operation to purge expired passes in background
class PurgeOperation: Operation {
    override func main() {
        guard !isCancelled else { return }
        
        // Perform purge
        VerifdPassManager.shared.purgeExpiredPasses()
    }
}
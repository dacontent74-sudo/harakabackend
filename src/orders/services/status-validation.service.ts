import { Injectable, Logger, BadRequestException } from '@nestjs/common';

@Injectable()
export class StatusValidationService {
  private readonly logger = new Logger(StatusValidationService.name);

  // Valid status transitions
  private readonly VALID_TRANSITIONS: { [key: string]: string[] } = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['preparing', 'cancelled'],
    'preparing': ['ready', 'cancelled'],
    'ready': ['assigned', 'cancelled'],
    'assigned': ['picked_up', 'cancelled'],
    'picked_up': ['delivered', 'cancelled'],
    'delivered': [], // Terminal state
    'cancelled': [], // Terminal state
    'failed': [], // Terminal state
  };

  /**
   * Validate if status transition is allowed
   * @param currentStatus - Current order status
   * @param newStatus - Requested new status
   * @returns true if transition is valid
   * @throws BadRequestException if transition is invalid
   */
  validateTransition(currentStatus: string, newStatus: string): boolean {
    // If status is the same, allow (idempotent)
    if (currentStatus === newStatus) {
      this.logger.log(`✅ Status unchanged: ${currentStatus}`);
      return true;
    }

    // Check if transition is allowed
    const allowedNextStatuses = this.VALID_TRANSITIONS[currentStatus];

    if (!allowedNextStatuses) {
      this.logger.error(`❌ Unknown current status: ${currentStatus}`);
      throw new BadRequestException(`Invalid current status: ${currentStatus}`);
    }

    if (!allowedNextStatuses.includes(newStatus)) {
      this.logger.error(`❌ Invalid transition: ${currentStatus} → ${newStatus}`);
      throw new BadRequestException(
        `Invalid status transition: Cannot change from "${currentStatus}" to "${newStatus}". ` +
        `Allowed transitions: ${allowedNextStatuses.join(', ') || 'none (terminal state)'}`
      );
    }

    this.logger.log(`✅ Valid transition: ${currentStatus} → ${newStatus}`);
    return true;
  }

  /**
   * Get allowed next statuses for current status
   * @param currentStatus - Current order status
   * @returns Array of allowed next statuses
   */
  getAllowedNextStatuses(currentStatus: string): string[] {
    return this.VALID_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Check if status is terminal (no further transitions allowed)
   * @param status - Status to check
   * @returns true if terminal status
   */
  isTerminalStatus(status: string): boolean {
    const allowedTransitions = this.VALID_TRANSITIONS[status];
    return allowedTransitions !== undefined && allowedTransitions.length === 0;
  }

  /**
   * Get complete status flow as documentation
   * @returns Status flow map
   */
  getStatusFlow(): { [key: string]: string[] } {
    return { ...this.VALID_TRANSITIONS };
  }
}

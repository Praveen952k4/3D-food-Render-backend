const GSTAuditEvent = require('../../models/gst/GSTAuditEvent');
const crypto = require('crypto');

/**
 * Service to record tamper-evident append-only audit trail events
 */
class GSTAuditService {
  /**
   * Log an audit event
   * @param {Object} params
   * @param {string} params.restaurantId
   * @param {string} params.action - e.g. 'PROFILE_UPDATED', 'GSTR1_GENERATED', 'RETURN_APPROVED'
   * @param {Object} params.actor - { userId, phone, role }
   * @param {Object} params.details - Snapshot of change
   * @param {string} [params.correlationId]
   * @param {string} [params.ipAddress]
   */
  static async logEvent({
    restaurantId = 'default_restaurant',
    action,
    actor,
    details = {},
    correlationId = null,
    ipAddress = '127.0.0.1'
  }) {
    try {
      const eventCorrelationId = correlationId || crypto.randomUUID();
      
      // Clean details to ensure no secrets or sensitive tokens are stored
      const sanitizedDetails = this.sanitize(details);

      const event = new GSTAuditEvent({
        restaurantId,
        action,
        actor: {
          userId: actor?.id || actor?.userId || null,
          phone: actor?.phone || 'unknown',
          role: actor?.role || 'admin',
        },
        details: sanitizedDetails,
        correlationId: eventCorrelationId,
        ipAddress,
        timestamp: new Date(),
      });

      await event.save();
      return event;
    } catch (error) {
      console.error('❌ Failed to record GST audit event:', error);
      // We don't throw an error here to prevent blocking main transaction if logging fails,
      // but in production an alert would be triggered.
      return null;
    }
  }

  /**
   * Redact sensitive fields such as passwords, OTPs, or API secrets
   */
  static sanitize(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };
    const sensitiveKeys = ['password', 'otp', 'token', 'secret', 'apikey', 'authorization'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }
    return sanitized;
  }

  /**
   * Retrieve audit events with pagination and filtering
   */
  static async getEvents({ restaurantId = 'default_restaurant', page = 1, limit = 50, action = null }) {
    const query = { restaurantId };
    if (action) query.action = action;

    const skip = (page - 1) * limit;
    const total = await GSTAuditEvent.countDocuments(query);
    const events = await GSTAuditEvent.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    return {
      events,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      }
    };
  }
}

module.exports = GSTAuditService;

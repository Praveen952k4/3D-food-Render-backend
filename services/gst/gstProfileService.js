const GSTProfile = require('../../models/gst/GSTProfile');
const GSTAuditService = require('./gstAuditService');

// Indian State Codes dictionary for GSTIN validation
const GST_STATE_CODES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '28': 'Andhra Pradesh',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh'
};

class GSTProfileService {
  /**
   * Get or create GST Profile for a restaurant
   */
  static async getProfile(restaurantId = 'default_restaurant') {
    let profile = await GSTProfile.findOne({ restaurantId });
    if (!profile) {
      profile = await GSTProfile.create({
        restaurantId,
        isGstRegistered: true,
        gstin: '33AAAAA0000A1Z5',
        legalBusinessName: 'AR Food Dining Private Limited',
        tradeName: 'AR Food Restaurant',
        registrationType: 'regular',
        state: 'Tamil Nadu',
        stateCode: '33',
        restaurantCategory: 'standalone_restaurant',
        taxTreatment: '5_percent_no_itc',
        itcEligible: false,
        inHotelPremises: false,
        invoiceSeriesPrefix: 'ARF',
        financialYear: '2026-27',
        reviewStatus: 'verified',
      });
    }
    return profile;
  }

  /**
   * Validate GSTIN format and state code consistency
   */
  static validateGstin(gstin, expectedStateCode = null) {
    if (!gstin) return { valid: false, error: 'GSTIN cannot be empty' };

    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!regex.test(gstin)) {
      return { 
        valid: false, 
        error: 'Invalid GSTIN format. Expected 15 characters (e.g. 33AAAAA0000A1Z5).' 
      };
    }

    const stateCode = gstin.substring(0, 2);
    if (!GST_STATE_CODES[stateCode]) {
      return { 
        valid: false, 
        error: `Invalid state code ${stateCode} in GSTIN.` 
      };
    }

    if (expectedStateCode && stateCode !== expectedStateCode) {
      return {
        valid: false,
        error: `GSTIN state code (${stateCode} - ${GST_STATE_CODES[stateCode]}) does not match profile state code (${expectedStateCode}).`
      };
    }

    return {
      valid: true,
      stateCode,
      stateName: GST_STATE_CODES[stateCode],
      pan: gstin.substring(2, 12),
    };
  }

  /**
   * Update GST profile with compliance assertions and audit log
   */
  static async updateProfile(restaurantId = 'default_restaurant', updateData, actor) {
    const existing = await this.getProfile(restaurantId);

    // If registered, validate GSTIN
    if (updateData.isGstRegistered) {
      const gstinVal = this.validateGstin(updateData.gstin, updateData.stateCode || existing.stateCode);
      if (!gstinVal.valid) {
        throw new Error(gstinVal.error);
      }
    }

    // Enforce statutory rules: Standalone restaurant @ 5% GST cannot claim ITC
    if (updateData.restaurantCategory === 'standalone_restaurant' && updateData.taxTreatment === '5_percent_no_itc') {
      updateData.itcEligible = false;
    }

    // Set state code name mapping if provided
    if (updateData.stateCode && GST_STATE_CODES[updateData.stateCode]) {
      updateData.state = GST_STATE_CODES[updateData.stateCode];
    }

    updateData.lastUpdatedBy = actor?.id || actor?.userId;

    const updated = await GSTProfile.findOneAndUpdate(
      { restaurantId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'GST_PROFILE_UPDATED',
      actor,
      details: {
        isGstRegistered: updated.isGstRegistered,
        gstin: updated.gstin,
        taxTreatment: updated.taxTreatment,
        itcEligible: updated.itcEligible,
        reviewStatus: updated.reviewStatus,
      }
    });

    return updated;
  }

  /**
   * Generates a compliance checklist
   */
  static async getComplianceChecklist(restaurantId = 'default_restaurant') {
    const profile = await this.getProfile(restaurantId);
    
    return [
      {
        id: 'registration',
        title: 'GST Registration Status',
        passed: profile.isGstRegistered ? !!profile.gstin : true,
        message: profile.isGstRegistered 
          ? `Registered under GSTIN: ${profile.gstin}` 
          : 'Operating as Unregistered Supplier (GST returns disabled)',
      },
      {
        id: 'tax_rate',
        title: 'Tax Treatment Configuration',
        passed: true,
        message: profile.taxTreatment === '5_percent_no_itc'
          ? '5% GST (2.5% CGST + 2.5% SGST) without Input Tax Credit'
          : `${profile.taxTreatment} treatment applied`,
      },
      {
        id: 'itc_rule',
        title: 'ITC Restriction Verification',
        passed: profile.taxTreatment === '5_percent_no_itc' ? !profile.itcEligible : true,
        message: !profile.itcEligible 
          ? 'Compliant: ITC is disabled for standalone restaurant as required by CBIC rules'
          : 'Warning: Claiming ITC requires documentation of hotel tariff or room charges',
      },
      {
        id: 'invoice_prefix',
        title: 'Invoice Series Format',
        passed: !!profile.invoiceSeriesPrefix,
        message: `Invoices prefixed with '${profile.invoiceSeriesPrefix}' for FY ${profile.financialYear}`,
      }
    ];
  }
}

module.exports = GSTProfileService;

const GSTReconciliationItem = require('../../models/gst/GSTReconciliationItem');
const GSTProfileService = require('./gstProfileService');
const GSTTaxCalculationService = require('./gstTaxCalculationService');
const GSTAuditService = require('./gstAuditService');

class GSTReconciliationService {
  /**
   * Add a reconciliation item (purchase invoice, credit/debit note)
   */
  static async addItem(restaurantId = 'default_restaurant', itemData, actor) {
    const profile = await GSTProfileService.getProfile(restaurantId);

    // If restaurant is standalone @ 5%, statutory restriction applies on ITC
    if (profile.taxTreatment === '5_percent_no_itc' && itemData.itcEligibility === 'eligible') {
      itemData.itcEligibility = 'ineligible';
      itemData.notes = (itemData.notes ? itemData.notes + ' | ' : '') + 
        'ITC automatically marked ineligible: Standalone restaurant operating under 5% GST rate cannot claim ITC (CBIC Notification 11/2017).';
    }

    const item = new GSTReconciliationItem({
      restaurantId,
      period: itemData.period,
      type: itemData.type,
      referenceNumber: itemData.referenceNumber,
      referenceDate: itemData.referenceDate || new Date(),
      partyGstin: itemData.partyGstin || '',
      partyName: itemData.partyName || '',
      taxableValue: Number(itemData.taxableValue) || 0,
      cgst: Number(itemData.cgst) || 0,
      sgst: Number(itemData.sgst) || 0,
      igst: Number(itemData.igst) || 0,
      totalAmount: Number(itemData.totalAmount) || 0,
      itcEligibility: itemData.itcEligibility || 'ineligible',
      reconciliationStatus: itemData.reconciliationStatus || 'reconciled',
      notes: itemData.notes || '',
      addedBy: actor?.id || actor?.userId,
    });

    await item.save();

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'RECONCILIATION_ITEM_ADDED',
      actor,
      details: {
        type: item.type,
        ref: item.referenceNumber,
        period: item.period,
        taxableValue: item.taxableValue,
        itcEligibility: item.itcEligibility,
      }
    });

    return item;
  }

  /**
   * Get reconciliation items for a period
   */
  static async getItems(restaurantId = 'default_restaurant', period) {
    return await GSTReconciliationItem.find({ restaurantId, period }).sort({ referenceDate: -1 });
  }

  /**
   * Compute reconciliation summary for a given output tax snapshot
   */
  static async getReconciliationSummary(restaurantId = 'default_restaurant', period, outputTaxSnapshot) {
    const items = await this.getItems(restaurantId, period);

    let totalPurchasesPaise = 0;
    let totalInwardTaxPaise = 0;
    let eligibleItcPaise = 0;
    let blockedItcPaise = 0;
    let creditNotesTotalPaise = 0;

    items.forEach(item => {
      const taxable = GSTTaxCalculationService.toPaise(item.taxableValue);
      const tax = GSTTaxCalculationService.toPaise(item.cgst + item.sgst + item.igst);

      if (item.type === 'purchase_invoice') {
        totalPurchasesPaise += taxable;
        totalInwardTaxPaise += tax;

        if (item.itcEligibility === 'eligible') {
          eligibleItcPaise += tax;
        } else {
          blockedItcPaise += tax;
        }
      } else if (item.type === 'credit_note') {
        creditNotesTotalPaise += taxable;
      }
    });

    const outputTaxPaise = GSTTaxCalculationService.toPaise(outputTaxSnapshot?.totalOutputTax || 0);
    const estimatedLiabilityPaise = Math.max(0, outputTaxPaise - eligibleItcPaise);

    const unresolvedIssues = [];
    if (items.some(i => i.reconciliationStatus === 'unmatched')) {
      unresolvedIssues.push('There are unmatched purchase invoices that require reconciliation.');
    }
    if (items.some(i => i.reconciliationStatus === 'requires_review')) {
      unresolvedIssues.push('Some reconciliation entries are flagged as requiring tax professional review.');
    }

    return {
      period,
      totalPurchases: GSTTaxCalculationService.toRupees(totalPurchasesPaise),
      totalInwardTax: GSTTaxCalculationService.toRupees(totalInwardTaxPaise),
      eligibleItc: GSTTaxCalculationService.toRupees(eligibleItcPaise),
      blockedItc: GSTTaxCalculationService.toRupees(blockedItcPaise),
      creditNotesTotal: GSTTaxCalculationService.toRupees(creditNotesTotalPaise),
      outputTax: GSTTaxCalculationService.toRupees(outputTaxPaise),
      estimatedNetLiability: GSTTaxCalculationService.toRupees(estimatedLiabilityPaise),
      isLiabilityFinal: unresolvedIssues.length === 0,
      unresolvedIssues,
      liabilityLabel: 'Estimated GST Liability — subject to reconciliation and review',
    };
  }
}

module.exports = GSTReconciliationService;

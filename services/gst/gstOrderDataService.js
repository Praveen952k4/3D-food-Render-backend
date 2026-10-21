const Order = require('../../models/Order');
const GSTCalculationSnapshot = require('../../models/gst/GSTCalculationSnapshot');
const GSTProfileService = require('./gstProfileService');
const GSTTaxCalculationService = require('./gstTaxCalculationService');
const GSTAuditService = require('./gstAuditService');

class GSTOrderDataService {
  /**
   * Parse period string 'YYYY-MM' into Date range (start and end)
   */
  static getPeriodDateRange(period) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      const now = new Date();
      period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 1, 0, 0, 0, 0); // start of next month

    return { startDate, endDate, period };
  }

  /**
   * Determine Indian financial year from date or period (e.g. 2026-10 -> '2026-27')
   */
  static getFinancialYear(dateOrPeriod) {
    let date;
    if (typeof dateOrPeriod === 'string' && /^\d{4}-\d{2}$/.test(dateOrPeriod)) {
      const [year, month] = dateOrPeriod.split('-').map(Number);
      date = new Date(year, month - 1, 1);
    } else {
      date = new Date(dateOrPeriod);
    }

    const month = date.getMonth(); // 0-indexed: 0 is Jan, 3 is Apr
    const year = date.getFullYear();

    if (month >= 3) {
      // April onwards: FY year - (year+1)
      const nextYearShort = String(year + 1).slice(-2);
      return `${year}-${nextYearShort}`;
    } else {
      // Jan - March: FY (year-1) - year
      const currentYearShort = String(year).slice(-2);
      return `${year - 1}-${currentYearShort}`;
    }
  }

  /**
   * Aggregate eligible orders and generate/update calculation snapshot
   */
  static async calculatePeriodSnapshot(restaurantId = 'default_restaurant', period, actor) {
    const { startDate, endDate } = this.getPeriodDateRange(period);
    const profile = await GSTProfileService.getProfile(restaurantId);

    // Eligible orders: payment successful or order delivered/confirmed, not cancelled
    const eligibleOrders = await Order.find({
      createdAt: { $gte: startDate, $lt: endDate },
      status: { $ne: 'cancelled' },
      paymentStatus: { $in: ['success', 'completed', 'pending'] } // include cash/dine-in that are valid orders
    }).populate('items.foodId');

    let totalGrossSalesPaise = 0;
    let totalDiscountPaise = 0;
    let totalTaxablePaise = 0;
    let totalTaxPaise = 0;
    let totalCgstPaise = 0;
    let totalSgstPaise = 0;
    let totalIgstPaise = 0;

    const categoryMap = {};

    eligibleOrders.forEach(order => {
      // Subtotal before tax and discount
      const subtotal = order.subtotal || 0;
      const discount = (order.discount || 0) + (order.couponDiscount || 0);
      const netTaxable = Math.max(0, subtotal - discount);

      // Use profile tax rate (default 5%)
      const ratePercent = profile.taxTreatment === '18_percent_with_itc' ? 18.0 : 5.0;
      const taxCalc = GSTTaxCalculationService.calculateTax(netTaxable, { 
        ratePercent, 
        isInterstate: false 
      });

      totalGrossSalesPaise += GSTTaxCalculationService.toPaise(subtotal);
      totalDiscountPaise += GSTTaxCalculationService.toPaise(discount);
      totalTaxablePaise += GSTTaxCalculationService.toPaise(netTaxable);
      totalTaxPaise += GSTTaxCalculationService.toPaise(taxCalc.totalTax);
      totalCgstPaise += GSTTaxCalculationService.toPaise(taxCalc.cgst);
      totalSgstPaise += GSTTaxCalculationService.toPaise(taxCalc.sgst);
      totalIgstPaise += GSTTaxCalculationService.toPaise(taxCalc.igst);

      // Breakdown by food category / HSN
      order.items.forEach(item => {
        const cat = item.foodId?.category || 'General Menu';
        const hsn = '996331'; // Restaurant SAC code
        if (!categoryMap[cat]) {
          categoryMap[cat] = {
            category: cat,
            hsnCode: hsn,
            count: 0,
            taxableAmountPaise: 0,
            taxAmountPaise: 0,
          };
        }
        categoryMap[cat].count += item.quantity || 1;
        const itemSubtotal = item.subtotal || (item.price * (item.quantity || 1));
        categoryMap[cat].taxableAmountPaise += GSTTaxCalculationService.toPaise(itemSubtotal);
        const itemTax = GSTTaxCalculationService.calculateTax(itemSubtotal, { ratePercent }).totalTax;
        categoryMap[cat].taxAmountPaise += GSTTaxCalculationService.toPaise(itemTax);
      });
    });

    const categoryBreakdown = Object.values(categoryMap).map(c => ({
      category: c.category,
      hsnCode: c.hsnCode,
      count: c.count,
      taxableAmount: GSTTaxCalculationService.toRupees(c.taxableAmountPaise),
      taxAmount: GSTTaxCalculationService.toRupees(c.taxAmountPaise),
    }));

    const financialYear = this.getFinancialYear(period);

    const snapshotData = {
      restaurantId,
      period,
      financialYear,
      ruleVersion: 'v1.0-2026',
      totalEligibleOrders: eligibleOrders.length,
      grossSales: GSTTaxCalculationService.toRupees(totalGrossSalesPaise),
      totalDiscounts: GSTTaxCalculationService.toRupees(totalDiscountPaise),
      taxableTurnover: GSTTaxCalculationService.toRupees(totalTaxablePaise),
      cgst: GSTTaxCalculationService.toRupees(totalCgstPaise),
      sgst: GSTTaxCalculationService.toRupees(totalSgstPaise),
      igst: GSTTaxCalculationService.toRupees(totalIgstPaise),
      totalOutputTax: GSTTaxCalculationService.toRupees(totalTaxPaise),
      sourceOrderIds: eligibleOrders.map(o => o._id),
      categoryBreakdown,
      status: 'calculated',
      calculatedBy: actor?.id || actor?.userId,
      updatedAt: new Date(),
    };

    const snapshot = await GSTCalculationSnapshot.findOneAndUpdate(
      { restaurantId, period },
      { $set: snapshotData },
      { upsert: true, new: true }
    );

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'GST_SNAPSHOT_CALCULATED',
      actor,
      details: {
        period,
        eligibleOrdersCount: eligibleOrders.length,
        taxableTurnover: snapshot.taxableTurnover,
        totalOutputTax: snapshot.totalOutputTax,
      }
    });

    return snapshot;
  }

  /**
   * Retrieve snapshot for period
   */
  static async getSnapshot(restaurantId = 'default_restaurant', period) {
    return await GSTCalculationSnapshot.findOne({ restaurantId, period });
  }
}

module.exports = GSTOrderDataService;

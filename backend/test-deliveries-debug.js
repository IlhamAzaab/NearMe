/**
 * Direct database test to check deliveries and debug why today's sales is 0
 * Run from backend folder: node test-deliveries-debug.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from parent directory
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.log('SUPABASE_URL:', supabaseUrl ? '✓ Set' : '❌ Missing');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✓ Set' : '❌ Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Sri Lanka time boundaries function
function getSriLankaTimeBoundaries(dateType = "today") {
  const now = new Date();
  const sriLankaOffsetMs = 5.5 * 60 * 60 * 1000;
  const sriLankaTime = new Date(now.getTime() + sriLankaOffsetMs);
  const sriLankaDateStr = sriLankaTime.toISOString().split("T")[0];

  let targetDateStr;
  if (dateType === "yesterday") {
    const yesterday = new Date(sriLankaTime);
    yesterday.setDate(yesterday.getDate() - 1);
    targetDateStr = yesterday.toISOString().split("T")[0];
  } else {
    targetDateStr = sriLankaDateStr;
  }

  const [year, month, day] = targetDateStr.split("-").map(Number);
  const startOfDaySL = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const startOfDayUTC = new Date(startOfDaySL.getTime() - sriLankaOffsetMs);

  const nextDay = new Date(startOfDayUTC);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  return {
    todayStart: startOfDayUTC.toISOString(),
    tomorrowStart: nextDay.toISOString(),
    dateStr: targetDateStr,
    sriLankaDateStr,
  };
}

async function debugDeliveries() {
  console.log('\n🔍 DEBUGGING TODAY\'S SALES CALCULATION\n');
  console.log('='.repeat(70));

  const { todayStart, tomorrowStart, dateStr, sriLankaDateStr } = getSriLankaTimeBoundaries('today');

  console.log('\n📅 TIME BOUNDARIES:');
  console.log(`Current UTC Time: ${new Date().toISOString()}`);
  console.log(`Sri Lanka Date: ${sriLankaDateStr}`);
  console.log(`Target Date: ${dateStr}`);
  console.log(`Range Start (UTC): ${todayStart}`);
  console.log(`Range End (UTC): ${tomorrowStart}`);

  // Fetch ALL delivered COD orders
  console.log('\n' + '='.repeat(70));
  console.log('\n📦 FETCHING ALL DELIVERED COD ORDERS:\n');

  const { data: allDeliveries, error } = await supabase
    .from('deliveries')
    .select(`
      id,
      driver_id,
      delivered_at,
      updated_at,
      status,
      orders!inner (
        id,
        total_amount,
        payment_method,
        status
      )
    `)
    .eq('status', 'delivered')
    .eq('orders.payment_method', 'cash')
    .eq('orders.status', 'delivered')
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('❌ Error fetching deliveries:', error.message);
    return;
  }

  console.log(`Total delivered COD orders found: ${allDeliveries?.length || 0}`);

  if (!allDeliveries || allDeliveries.length === 0) {
    console.log('\n⚠️  NO DELIVERED COD ORDERS FOUND IN DATABASE!');
    console.log('This is why today\'s sales shows Rs. 0.00');

    // Check if there are ANY deliveries at all
    const { data: anyDeliveries, error: anyError } = await supabase
      .from('deliveries')
      .select('id, status, updated_at')
      .limit(5);

    console.log('\n📋 Sample of ANY deliveries in database:');
    if (anyDeliveries && anyDeliveries.length > 0) {
      anyDeliveries.forEach((d, i) => {
        console.log(`  ${i + 1}. ID: ${d.id}, Status: ${d.status}, Updated: ${d.updated_at}`);
      });
    } else {
      console.log('  No deliveries found at all!');
    }
    return;
  }

  // Show sample of deliveries
  console.log('\n📋 RECENT DELIVERED COD ORDERS:');
  allDeliveries.slice(0, 10).forEach((d, i) => {
    const deliveryTime = d.delivered_at || d.updated_at;
    const inRange = new Date(deliveryTime) >= new Date(todayStart) && new Date(deliveryTime) < new Date(tomorrowStart);
    console.log(`\n${i + 1}. Delivery ID: ${d.id}`);
    console.log(`   Order Amount: Rs. ${d.orders?.total_amount}`);
    console.log(`   delivered_at: ${d.delivered_at || 'NULL'}`);
    console.log(`   updated_at: ${d.updated_at}`);
    console.log(`   Using time: ${deliveryTime}`);
    console.log(`   IN TODAY'S RANGE: ${inRange ? '✅ YES' : '❌ NO'}`);
  });

  // Filter by date
  console.log('\n' + '='.repeat(70));
  console.log('\n🔬 FILTERING BY TODAY\'S RANGE:\n');

  const periodDeliveries = allDeliveries.filter((d) => {
    const deliveryTime = d.delivered_at || d.updated_at;
    if (!deliveryTime) return false;
    const deliveryDate = new Date(deliveryTime);
    return deliveryDate >= new Date(todayStart) && deliveryDate < new Date(tomorrowStart);
  });

  console.log(`Deliveries in today's range: ${periodDeliveries.length}`);

  if (periodDeliveries.length > 0) {
    const totalSales = periodDeliveries.reduce((sum, d) => sum + parseFloat(d.orders?.total_amount || 0), 0);
    console.log(`\n💰 TODAY'S SALES TOTAL: Rs. ${totalSales.toFixed(2)}`);
  } else {
    console.log('\n⚠️  NO DELIVERIES IN TODAY\'S RANGE!');
    if (allDeliveries.length > 0) {
      const latest = allDeliveries[0];
      const latestTime = latest.delivered_at || latest.updated_at;
      console.log(`\nMost recent delivery time: ${latestTime}`);
      console.log(`Today's range: ${todayStart} to ${tomorrowStart}`);

      const latestDate = new Date(latestTime);
      const todayStartDate = new Date(todayStart);

      if (latestDate < todayStartDate) {
        const diffMs = todayStartDate - latestDate;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        console.log(`\n📊 The most recent delivery was ${diffHours}h ${diffMins}m BEFORE today started.`);
        console.log('   This means no deliveries have been made today yet.');
      }
    }
  }

  // Check driver balances
  console.log('\n' + '='.repeat(70));
  console.log('\n💼 DRIVER BALANCES:\n');

  const { data: balances, error: balanceError } = await supabase
    .from('driver_balances')
    .select('driver_id, pending_deposit, total_collected')
    .gt('pending_deposit', 0);

  if (balanceError) {
    console.error('❌ Error fetching balances:', balanceError.message);
  } else {
    console.log(`Drivers with pending balance: ${balances?.length || 0}`);
    if (balances && balances.length > 0) {
      const total = balances.reduce((sum, b) => sum + parseFloat(b.pending_deposit || 0), 0);
      console.log(`Total pending across all drivers: Rs. ${total.toFixed(2)}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n✅ DEBUG COMPLETE\n');
}

debugDeliveries().catch(error => {
  console.error('\n❌ Script failed:', error);
  process.exit(1);
});

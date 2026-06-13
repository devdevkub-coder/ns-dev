import { prisma } from '../src/lib/server/prisma.js';

async function run() {
  console.log('Querying table row counts in public schema...');
  try {
    const tableCounts: any[] = await prisma.$queryRaw`
      SELECT table_name, 
             coalesce((xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint, 0) as row_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY row_count DESC, table_name ASC;
    `;
    console.log(`Found ${tableCounts.length} tables in public schema:`);
    for (const t of tableCounts) {
      console.log(`- Table: ${t.table_name} (${t.row_count} rows)`);
    }
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();


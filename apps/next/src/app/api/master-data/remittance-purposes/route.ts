import { errorJson } from '@/lib/server/master-data'
import { listSimpleMasterData, saveSimpleMasterData } from '@/lib/server/simple-master-tables'

export const runtime = 'nodejs'

export async function GET() {
  try {
    return await listSimpleMasterData('remittancePurposes')
  } catch (caught) {
    return errorJson(caught, 'โหลดข้อมูลวัตถุประสงค์โอนไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    return await saveSimpleMasterData(request, 'remittancePurposes')
  } catch (caught) {
    return errorJson(caught, 'บันทึกข้อมูลวัตถุประสงค์โอนไม่ได้')
  }
}

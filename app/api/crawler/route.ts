import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
// 🚨 아래 꼭 대표님의 진짜 익명 키로 바꿔주세요!
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function GET() {
  console.log("🤖 [네이버 크롤러] 수집 및 자동 청소 2단 콤보 가동...");
  const scrapedDeals: any[] = [];  

  // ====================================================================
  // 1. 네이버페이 혜택 수집
  // ====================================================================
  try {
    const NAVER_API_URL = 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1';
    
    const { data: naverData } = await axios.get(NAVER_API_URL, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'referer': 'https://pay.naver.com/benefit/payment/list?firstCategory=DOMESTIC_INSTORE',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0'
      }
    });

    if (naverData && naverData.elements && Array.isArray(naverData.elements)) {
      naverData.elements.forEach((item: any) => {
        const title = `[${item.promotionName}] ${item.exposeTitle}`;
        const fullLink = item.detailUrl || item.link || "https://pay.naver.com";
        const eventEndDate = item.endDate || item.displayEndDate || "기간 미정";

        if (!scrapedDeals.some(deal => deal.title === title)) {
          scrapedDeals.push({
            title: title,
            content: "링크를 클릭하여 상세 혜택을 확인하세요.",
            url: fullLink, 
            category: "쇼핑",
            sub_category: "네이버페이",
            author: "AutoBot",
            mall_name: item.promotionName,
            status: "진행중",
            end_date: eventEndDate,
          });
        }
      });
    }
    console.log(`✅ 네이버페이 혜택 추출 완료!`);
    
  } catch (e: any) {
    console.error("🚨 네이버페이 크롤링 에러:", e.message);
  }

  // ====================================================================
  // 2. Supabase DB에 혜택 저장
  // ====================================================================
  if (scrapedDeals.length > 0) {
    const { error } = await supabase.from('deals').insert(scrapedDeals);
    if (error) {
      console.error("🚨 DB 저장 에러:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  // ====================================================================
  // 3. 🧹 [신규] 자동 청소 2단 콤보 (종료 처리 & 7일 초과 삭제)
  // ====================================================================
  try {
    console.log("🧹 DB 자동 청소 시작...");
    // DB에 있는 모든 글의 날짜와 상태를 가져옵니다.
    const { data: allDeals, error: fetchError } = await supabase.from('deals').select('id, end_date, status');
    
    if (!fetchError && allDeals) {
      const now = new Date();
      const toUpdateIds: number[] = [];
      const toDeleteIds: number[] = [];

      allDeals.forEach((deal: any) => {
        // 날짜가 없거나 '기간 미정'인 글은 청소 대상에서 제외 (패스)
        if (!deal.end_date || deal.end_date === "기간 미정") return;

        // 안전한 날짜 계산을 위해 포맷팅 (예: 2026.08.15 -> 2026-08-15)
        const dateString = deal.end_date.replace(/\./g, '-');
        const endDate = new Date(dateString);

        // 정상적인 날짜 형식이 아니면 패스
        if (isNaN(endDate.getTime())) return;

        // 오늘 기준 날짜 차이 계산
        const diffTime = now.getTime() - endDate.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);

        if (diffDays > 7) {
          // 마감일 기준 7일 초과 -> 삭제 명단(쓰레기통)에 추가
          toDeleteIds.push(deal.id);
        } else if (diffDays > 0 && deal.status !== "종료") {
          // 마감일 지났고(0일 초과), 상태가 아직 '진행중'이면 -> 종료 명단에 추가
          toUpdateIds.push(deal.id);
        }
      });

      // 🗑️ 7일 지난 글들 한 방에 영구 삭제
      if (toDeleteIds.length > 0) {
        await supabase.from('deals').delete().in('id', toDeleteIds);
        console.log(`🗑️ 7일 경과된 글 ${toDeleteIds.length}개 영구 삭제 완료!`);
      }

      // 🏷️ 마감된 글들 한 방에 '종료' 처리
      if (toUpdateIds.length > 0) {
        await supabase.from('deals').update({ status: '종료' }).in('id', toUpdateIds);
        console.log(`🏷️ 마감된 글 ${toUpdateIds.length}개 '종료' 처리 완료!`);
      }
    }
  } catch (e: any) {
    console.error("🚨 청소 작업 중 에러:", e.message);
  }

  console.log(`🎉 크롤링 및 DB 청소 완전 성공!`);
  return NextResponse.json({ success: true, count: scrapedDeals.length, message: "크롤링 및 청소 완료" });
}
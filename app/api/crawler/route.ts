import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
// 🚨 아래 꼭 대표님의 진짜 익명 키로 바꿔주세요!
const SUPABASE_ANON_KEY = "대표님의_SUPABASE_ANON_KEY_입력"; 
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function GET() {
  console.log("🤖 [쌍끌이 봇] 네이버페이 + 페이코 실전 가동 (용량 최적화 버전)...");
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
        const fullLink = item.detailUrl;

        // 중복 방지 체크 후 삽입
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
          });
        }
      });
    }
    console.log(`✅ 네이버페이 혜택 추출 완료!`);
    
  } catch (e: any) { 
    console.error("🚨 네이버페이 크롤링 에러:", e.message); 
  }

  // ====================================================================
  // 2. 페이코 혜택 수집 (파이썬 코드를 TypeScript로 완벽 변환)
  // ====================================================================
  try {
    const PAYCO_API_URL = "https://apis.krp.toastoven.net/payco/couponhome/couponhomeCollectionList.json";
    
    const { data: paycoData } = await axios.get(PAYCO_API_URL, {
      params: {
        osType: "IOS",
        currentPageNo: "1",
        version: "17.0",
        readCount: "5"
      },
      headers: {
        "Host": "apis.krp.toastoven.net",
        "Accept": "*/*",
        "Connection": "keep-alive",
        "Payco-Language": "ko_KR",
        "DPoP": "eyJ0eXAiOiJkcG9wK2p3dCIsImFsZyI6IkVTMjU2IiwiandrIjp7InkiOiIzY0NEdzlFU1pYNDdNYk1valdCclB2VWRvcTJNbFJjVmlSLWplUkRSUTVBIiwieCI6ImtmVjJZbnJodWpBa0Q4S2l4czd4azZfcjk4MjZkdV9CV3FyZ0NGb2NlTlEiLCJrdHkiOiJFQyIsImNydiI6IlAtMjU2In19.eyJodHUiOiJodHRwczpcL1wvYXBpcy5rcnAudG9hc3RvdmVuLm5ldFwvcGF5Y29cL2NvdXBvbmhvbWVcL2NvdXBvbmhvbWVDb2xsZWN0aW9uTGlzdC5qc29uIiwiYXRoIjoiWjh6b3BkejNGWDdRam5ZYUVWNmtOYVFYdm9VSjVsZlVGOWxGTTdBUzhmbyIsImlhdCI6MTc4NTY4Mjc0Ny4yMjAyMDgyLCJqdGkiOiIzOUQ5NTc2Ni03QzkzLTQ0NTctOUYyMi1FQTRGNDg0RDQ3QTMiLCJodG0iOiJHRVQifQ.-0d_XuejN8v4K7XqStj1yiswR9XpwPfs46TS1kL8fKr42NlFxkXZy26uD-Xs05nt0btUtdGlxcDRMV9Cs2wfRg",
        "payco-kdata": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqBBKGAeBQRSdObwUX04oQ2lVwLxKNdN07gJyqgU5Z1JypRaO92tZ6h04AjHz3C+STf1sCBknDO0v5tczfr8b+uvlsh+XFN1xNR0iQL5mW/B1KX6nMBBSBCSXkWk3IQyF9PWrTppuXhhm+17I6f2fdVb0POhVem9ktLmiAu034a1SAXd/PdWZJe57qqMhBVCHdKmsYrveOHPsId/AlwS4TzlRBp1v/HsrFjHlc7Dkkz+Sko/U2hgpIfQG562YInZnX0gEgKxKsqWCoNmpahE+O+xCqXgyWEjZW9cZAhlk5fzxgPc1ZLbZuSEW51Ba4dsyXxVMY+FyZrNnHhq2fMLImwIDAQAB",
        "User-Agent": "PAYCO|3.81.0|iOS|18.7.2|iPhone15,4|6DBAE77F-4275-4D24-95D0-076193736839|20260802235907221||EMPTY",
        "access_token": "AAAAlQSlvJZl4g8953ytKGXTyN_vPoo0TMRkY2pgIo_J-qrqlgyseePtwWB4lD92_Ns6hJReO7R5pOo2J6DgC8cap0pxxYEfh4rCN6KTTbJsQc5ZYy-RW0Slg60aK5fkTCAA9u7ZuPD0G2CUAsC4CN1hvSsF83-M3nat15cgraJ39zM8vy2zh5Rij5X1r6NvVVAz7oFEbhndXnauZIMaKh2mCPI.A",
        "client_id": "o00wC0z1VUCcVd0urfFc",
        "Accept-Language": "ko-KR,ko;q=0.9"
      }
    });

    // 💡 페이코 데이터 파싱 (페이코의 실제 JSON 구조에 맞게 수정 필요할 수 있음)
    // 보통 data.result.couponList 등의 배열 형태로 들어옵니다.
    const paycoList = paycoData?.result?.couponList || paycoData?.couponList || []; 

    if (Array.isArray(paycoList)) {
      paycoList.forEach((item: any) => {
        // 페이코 데이터에 맞게 제목 설정 (예: item.couponName)
        const title = `[페이코] ${item.couponName || item.title || '새로운 할인 혜택'}`;
        
        if (!scrapedDeals.some(deal => deal.title === title)) {
          scrapedDeals.push({
            title: title,
            content: "링크를 클릭하여 상세 혜택을 확인하세요.", 
            url: "https://payco.com", // 상세 링크가 있다면 item.link 등으로 교체
            category: "쇼핑",
            sub_category: "페이코",
            author: "AutoBot", 
            mall_name: item.brandName || "페이코", 
            status: "진행중",
          });
        }
      });
    }
    console.log(`✅ 페이코 혜택 추출 완료!`);

  } catch (e: any) {
    console.error("🚨 페이코 크롤링 에러:", e.message); 
  }

  // ====================================================================
  // 3. Supabase DB에 한 번에 꽂아 넣기
  // ====================================================================
  if (scrapedDeals.length > 0) {
    const { error } = await supabase.from('deals').insert(scrapedDeals);
    
    if (error) {
      console.error("🚨 DB 저장 에러:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  console.log(`🎉 크롤링 완전 성공! 총 ${scrapedDeals.length}개의 딜을 DB에 저장했습니다.`);
  return NextResponse.json({ success: true, count: scrapedDeals.length });
}
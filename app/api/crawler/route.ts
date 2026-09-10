import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const stealthHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'max-age=0',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

const extractDate = (text: string) => {
  if (!text || text.includes('소진') || text.includes('미정')) {
    return null;
  }
  const cleanText = text.replace(/\s+/g, ''); 
  
  const regexFull = /(20\d{2})[.\-년/]+(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesFull = [...cleanText.matchAll(regexFull)];
  if (matchesFull.length > 0) {
    return `${matchesFull[matchesFull.length - 1][1]}-${matchesFull[matchesFull.length - 1][2].padStart(2, '0')}-${matchesFull[matchesFull.length - 1][3].padStart(2, '0')}`;
  }
  
  const regexShortYear = /(?<!20)(\d{2})[.\-년/]+(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesShortYear = [...cleanText.matchAll(regexShortYear)];
  if (matchesShortYear.length > 0) {
    return `20${matchesShortYear[matchesShortYear.length - 1][1]}-${matchesShortYear[matchesShortYear.length - 1][2].padStart(2, '0')}-${matchesShortYear[matchesShortYear.length - 1][3].padStart(2, '0')}`;
  }
  
  const regexNoYear = /(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesNoYear = [...cleanText.matchAll(regexNoYear)];
  if (matchesNoYear.length > 0) {
    return `${new Date().getFullYear()}-${matchesNoYear[matchesNoYear.length - 1][1].padStart(2, '0')}-${matchesNoYear[matchesNoYear.length - 1][2].padStart(2, '0')}`;
  }
  
  const regexYYYYMMDD = /(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/g;
  const matchesYYYYMMDD = [...cleanText.matchAll(regexYYYYMMDD)];
  if (matchesYYYYMMDD.length > 0) {
    return `${matchesYYYYMMDD[matchesYYYYMMDD.length - 1][1]}-${matchesYYYYMMDD[matchesYYYYMMDD.length - 1][2]}-${matchesYYYYMMDD[matchesYYYYMMDD.length - 1][3]}`;
  }

  return null;
};

const isPast = (dateStr: string | null) => {
  if (!dateStr) {
    return false; 
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(dateStr);
  targetDate.setHours(0, 0, 0, 0);
  return targetDate.getTime() < today.getTime();
};

const findDeepCondition = (obj: any): string => {
  if (!obj || typeof obj !== 'object') {
    return "";
  }
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('condition') || lowerKey.includes('desc')) {
      const val = obj[key];
      if (typeof val === 'string' && val.length >= 4 && val.length <= 60 && !val.includes('http')) {
        return val.replace(/\n/g, ' ').trim();
      }
    }
    if (typeof obj[key] === 'object') {
      const res = findDeepCondition(obj[key]);
      if (res) {
        return res;
      }
    }
  }
  return "";
};

export async function GET() {
  console.log("🤖 [크롤링 & 마감 기준 사이트별 완벽 분리] 크롤러 가동 시작...");
  
  const diagnostics: Record<string, number> = {
    N_현장결제: 0,
    N_온라인: 0,
    N_쿠폰: 0,
    N_app: 0,
    버거킹: 0,
    SKT: 0,
    트립닷컴: 0,
    호텔스닷컴: 0,
    마이리얼트립: 0,
    CU: 0,
    도미노피자: 0,
    파리바게뜨: 0
  };
  const errors: string[] = [];
  const scrapedDeals: any[] = [];  
  const liveTitlesBySubAndMall: Record<string, string[]> = {};
  
  const pastParisTitles: string[] = [];
  
  const addLiveTitle = (sub: string, mall: string, title: string) => {
    const key = `${sub}_${mall}`;
    if (!liveTitlesBySubAndMall[key]) {
      liveTitlesBySubAndMall[key] = [];
    }
    liveTitlesBySubAndMall[key].push(title);
  };

  let existingTitles: string[] = [];
  try {
    const { data: existingDeals } = await supabase.from('deals').select('title');
    if (existingDeals) {
      existingTitles = existingDeals.map(d => d.title);
    } else {
      existingTitles = [];
    }
  } catch(e: any) {
    errors.push(`[DB 읽기 에러] ${e.message}`);
  }

  const genericContent = "💡 상세 내용은 혜택 받으러 가기 링크를 통해 확인하세요.";

  // ====================================================================
  // 1. 네이버페이 [현장결제] & [온라인]
  // ====================================================================
  const naverPayApis = [
    { url: 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1', sub: '네이버페이 현장결제', diagKey: 'N_현장결제' },
    { url: 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=ONLINE&secondCategory=&page=1', sub: '네이버페이 온라인', diagKey: 'N_온라인' }
  ];

  for (const target of naverPayApis) {
    try {
      const { data: naverData } = await axios.get(target.url, { headers: stealthHeaders, validateStatus: () => true });

      if (naverData?.elements) {
        diagnostics[target.diagKey] += naverData.elements.length; 
        
        naverData.elements.forEach((item: any) => {
          const title = `[${target.sub}] [${item.promotionName}] ${item.exposeTitle}`;
          let conditionText = item.exposeCondition || item.benefitCondition || findDeepCondition(item);
          conditionText = String(conditionText).replace(/\n/g, ' ').trim();
          
          const detailContent = conditionText ? `📌 [조건]\n${conditionText}\n\n${genericContent}` : genericContent;
          const link = item.detailUrl || item.link || "https://pay.naver.com";
          
          addLiveTitle(target.sub, item.promotionName, title); 

          if (!existingTitles.includes(title)) {
            let calculatedEndDate = null;
            const rawJson = JSON.stringify(item);

            const explicitDate = item.endDate || item.endDt || item.displayEndDate || item.endYmd;
            if (explicitDate) {
              calculatedEndDate = extractDate(String(explicitDate));
            }

            if (!calculatedEndDate) {
              const dDayMatch = rawJson.match(/"D-(\d+)"/i) || rawJson.match(/"[a-zA-Z]*(?:dday|leftday|dayleft|remain)[a-zA-Z]*"\s*:\s*(\d+)/i);
              if (dDayMatch) {
                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() + parseInt(dDayMatch[1], 10)); 
                calculatedEndDate = targetDate.toISOString().split('T')[0];
              }
            }

            if (!calculatedEndDate) {
              const dateMatch = rawJson.match(/(202\d)[-./]?(0[1-9]|1[0-2])[-./]?(0[1-9]|[12]\d|3[01])/);
              if (dateMatch) {
                calculatedEndDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
              }
            }

            if (!isPast(calculatedEndDate)) {
              scrapedDeals.push({
                title: title, 
                content: detailContent, 
                url: link, 
                category: "쇼핑", 
                sub_category: target.sub, 
                author: "AutoBot", 
                mall_name: item.promotionName, 
                status: "진행중", 
                end_date: calculatedEndDate, 
              });
            }
          }
        });
      }
    } catch (e: any) { 
      errors.push(`[${target.sub}] ${e.message}`); 
    }
  }

  // ====================================================================
  // 1-2. 네이버페이 [쿠폰]
  // ====================================================================
  try {
    const COUPON_API_URL = 'https://point.pay.naver.com/pd/public-api/coupon/v1/usages/by-category?couponUsageType=ONLINE';
    const USER_FACING_URL = 'https://point.pay.naver.com/coupon/home/online';
    
    const { data: couponData } = await axios.get(COUPON_API_URL, { headers: stealthHeaders, validateStatus: () => true });
    
    if (couponData && typeof couponData === 'object') {
      const extractCoupons = (obj: any): any[] => {
          let found: any[] = [];
          if (!obj || typeof obj !== 'object') {
            return found;
          }

          const brand = obj.merchantName || obj.brandName || obj.usageName || obj.promotionName; 
          if (brand && typeof brand === 'string' && brand.length < 30) {
              const benefit = obj.benefitName || obj.couponName || obj.title || obj.exposeTitle || "할인 쿠폰"; 
              const condition = obj.conditionText || obj.benefitCondition || findDeepCondition(obj); 
              found.push({ 
                brand: brand, 
                benefit: benefit, 
                condition: condition, 
                raw: obj 
              });
          }
          
          for (const key of Object.keys(obj)) { 
            if (typeof obj[key] === 'object') {
              found = found.concat(extractCoupons(obj[key])); 
            }
          }
          return found;
      };

      const extracted = extractCoupons(couponData);
      const uniqueCoupons = Array.from(new Set(extracted.map(e => JSON.stringify(e)))).map((e: any) => JSON.parse(e));

      uniqueCoupons.forEach((c: any) => {
          const title = `[네이버페이 쿠폰] [${c.brand}] ${c.benefit}`;
          let cText = c.condition ? String(c.condition).replace(/\n/g, ' ').trim() : "";
          const detailContent = cText ? `📌 [조건] ${cText}` : genericContent;

          addLiveTitle("네이버페이 쿠폰", c.brand, title);
          diagnostics.N_쿠폰++;

          if (!existingTitles.includes(title)) {
            scrapedDeals.push({
                title: title, 
                content: detailContent, 
                url: USER_FACING_URL, 
                category: "쇼핑", 
                sub_category: "네이버페이 쿠폰", 
                author: "AutoBot", 
                mall_name: c.brand, 
                status: "진행중", 
                end_date: null, 
            });
          }
      });
    }
  } catch (e: any) { 
    errors.push(`[네이버페이 쿠폰] ${e.message}`); 
  }

  // ====================================================================
  // ✨ 1-3. 네이버페이 [블로그 -> app] (수술: 무적의 RSS 피드 우회 파싱)
  // ====================================================================
  try {
    const BLOG_RSS_URL = 'https://rss.blog.naver.com/nv_npay.xml';
    // RSS는 XML 형태이므로 막힐 확률이 0%에 수렴합니다.
    const { data: rssData } = await axios.get(BLOG_RSS_URL, { headers: stealthHeaders, validateStatus: () => true });
    
    // 치리오를 XML 모드로 로드합니다.
    const $rss = cheerio.load(rssData, { xmlMode: true });
    
    $rss('item').each((index, element) => {
        let rawTitle = $rss(element).find('title').text() || "";
        rawTitle = rawTitle.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        const link = $rss(element).find('link').text().trim();
        
        if (rawTitle && !rawTitle.includes('종료') && !rawTitle.includes('마감')) {
            const extractedDate = extractDate(rawTitle);
            
            // 제목에 날짜가 포함되어 성공적으로 추출되었다면 무조건 추가
            if (extractedDate) {
                const title = `[네이버페이 app] ${rawTitle}`;
                
                if (!isPast(extractedDate)) {
                    addLiveTitle("네이버페이 app", "네이버페이", title);
                    diagnostics.N_app++;
                    
                    if (!existingTitles.includes(title)) {
                        scrapedDeals.push({
                            title: title, 
                            content: genericContent, 
                            url: link, 
                            category: "쇼핑", 
                            sub_category: "네이버페이 app", 
                            author: "AutoBot", 
                            mall_name: "네이버페이", 
                            status: "진행중", 
                            end_date: extractedDate, 
                        });
                    }
                }
            }
        }
    });
  } catch (e: any) { 
    errors.push(`[네이버페이 app RSS 에러] ${e.message}`); 
  }

  // ====================================================================
  // ✨ 2. 버거킹 (수술: API 호출 대신 정규식으로 소스코드 무식하게 강제 추출)
  // ====================================================================
  try {
    const BK_URL = 'https://www.burgerking.co.kr/event/ongoing';
    const { data: bkHtml } = await axios.get(BK_URL, { headers: stealthHeaders, validateStatus: () => true });
    
    // HTML 소스코드에 숨겨진 JSON 문자열에서 "subject":"이름" 패턴을 전부 강제로 찾아냅니다.
    const titleMatches = bkHtml.match(/"(?:subject|event_nm|name)"\s*:\s*"([^"]+)"/g);
    
    if (titleMatches && titleMatches.length > 0) {
        const uniqueTitles = new Set<string>();
        
        titleMatches.forEach(matchStr => {
            const actualTitle = matchStr.split(':')[1].replace(/"/g, '').trim();
            
            // 프로모션이 포함되어 있다면 무조건 추출
            if (actualTitle && actualTitle.includes('프로모션') && actualTitle.length > 2) {
                uniqueTitles.add(actualTitle);
            }
        });
        
        uniqueTitles.forEach(actualTitle => {
            let cleanTitle = actualTitle.length > 30 ? actualTitle.substring(0, 30) + "..." : actualTitle;
            const title = `[버거킹] ${cleanTitle}`;
            
            const extractedDate = extractDate(actualTitle);

            addLiveTitle("버거킹", "버거킹", title); 
            diagnostics.버거킹++;

            if (!existingTitles.includes(title) && !isPast(extractedDate)) {
              scrapedDeals.push({
                title: title, 
                content: genericContent, 
                url: 'https://www.burgerking.co.kr/event/ongoing', 
                category: "음식", 
                sub_category: "버거킹", 
                author: "AutoBot", 
                mall_name: "버거킹", 
                status: "진행중", 
                end_date: extractedDate,
              });
            }
        });
    } else {
        errors.push("버거킹 HTML 파싱 실패 (정규식 매칭 0건)");
    }
  } catch (e: any) { 
    errors.push(`[버거킹 강제추출 에러] ${e.message}`); 
  }

  // ====================================================================
  // 3. 통신사 SKT 
  // ====================================================================
  try {
    const TELECOM_URL = 'https://www.sktmembership.co.kr/epass/html/evt/event_list.jsp';
    const { data: telecomHtml } = await axios.get(TELECOM_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(telecomHtml);
    
    $('.event_list_wrap ul li').each((index, element) => {
      const rawTitle = $(element).find('dt').text().trim();
      const rawDateText = $(element).find('.date').text().trim() || $(element).text(); 
      if (rawTitle) {
        const title = `[T멤버십] ${rawTitle}`;
        const extractedDate = extractDate(rawDateText);
        addLiveTitle("통신사혜택", "SKT", title);
        diagnostics.SKT++;

        if (!existingTitles.includes(title) && !isPast(extractedDate)) {
          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: "https://sktmembership.co.kr", 
            category: "쇼핑", 
            sub_category: "통신사혜택", 
            author: "AutoBot", 
            mall_name: "SKT", 
            status: "진행중", 
            end_date: extractedDate 
          });
        }
      }
    });
  } catch (e: any) { 
    errors.push(`[SKT] ${e.message}`); 
  }

  // ====================================================================
  // 4. 여행 3사 
  // ====================================================================
  try {
    const TRIP_URL = 'https://kr.trip.com/sale/deals/';
    const { data: tripHtml } = await axios.get(TRIP_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(tripHtml);
    
    $('a[href*="/sale/"]').each((index, element) => {
      const rawText = $(element).text().replace(/\s+/g, ' ').trim();
      let link = $(element).attr('href');
      
      if (rawText && rawText.length > 5) {
        const title = `[트립닷컴] ${rawText.substring(0, 40)}`;
        const extractedDate = extractDate(rawText);
        
        addLiveTitle("숙박/호텔", "트립닷컴", title);
        diagnostics.트립닷컴++;

        if (!existingTitles.includes(title) && !isPast(extractedDate)) {
          let finalLink = link;
          if (link && !link.startsWith('http')) {
            finalLink = `https://kr.trip.com${link}`;
          }

          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: finalLink, 
            category: "여행", 
            sub_category: "숙박/호텔", 
            author: "AutoBot", 
            mall_name: "트립닷컴", 
            status: "진행중", 
            end_date: extractedDate 
          });
        }
      }
    });
  } catch (e: any) { 
    errors.push(`[트립닷컴] ${e.message}`); 
  }

  try {
    const HOTELS_URL = 'https://kr.hotels.com/hotel-deals/';
    const { data: hotelsHtml } = await axios.get(HOTELS_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(hotelsHtml);
    
    $('h2, h3, .offer-card-title, .title').each((index, element) => {
      const rawTitle = $(element).text().trim();
      const rawText = $(element).closest('a').text();
      const parentLink = $(element).closest('a').attr('href');
      
      if (rawTitle && (rawTitle.includes('할인') || rawTitle.includes('특가'))) {
        const title = `[호텔스닷컴] ${rawTitle}`;
        const extractedDate = extractDate(rawText);
        
        addLiveTitle("숙박/호텔", "호텔스닷컴", title);
        diagnostics.호텔스닷컴++;

        if (!existingTitles.includes(title) && !isPast(extractedDate)) {
          let finalLink = HOTELS_URL;
          if (parentLink) {
            finalLink = parentLink.startsWith('http') ? parentLink : `https://kr.hotels.com${parentLink}`;
          }

          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: finalLink, 
            category: "여행", 
            sub_category: "숙박/호텔", 
            author: "AutoBot", 
            mall_name: "호텔스닷컴", 
            status: "진행중", 
            end_date: extractedDate 
          });
        }
      }
    });
  } catch (e: any) { 
    errors.push(`[호텔스닷컴] ${e.message}`); 
  }

  try {
    const MRT_URL = 'https://www.myrealtrip.com/promotions';
    const { data: mrtHtml } = await axios.get(MRT_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(mrtHtml);
    
    $('.promotion-item, a[href*="/promotions/"]').each((index, element) => {
      const rawTitle = $(element).find('.title, h3, p').first().text().trim() || $(element).text().trim();
      const rawDateText = $(element).find('.date, .period').text().trim() || $(element).text();
      let link = $(element).attr('href') || $(element).closest('a').attr('href');
      
      if (rawTitle && rawTitle.length > 5) {
        const title = `[마이리얼트립] ${rawTitle}`;
        const extractedDate = extractDate(rawDateText);
        
        addLiveTitle("액티비티/렌트", "마이리얼트립", title);
        diagnostics.마이리얼트립++;

        if (!existingTitles.includes(title) && !isPast(extractedDate)) {
          let finalLink = link;
          if (link && !link.startsWith('http')) {
            finalLink = `https://www.myrealtrip.com${link}`;
          }

          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: finalLink, 
            category: "여행", 
            sub_category: "액티비티/렌트", 
            author: "AutoBot", 
            mall_name: "마이리얼트립", 
            status: "진행중", 
            end_date: extractedDate 
          });
        }
      }
    });
  } catch (e: any) { 
    errors.push(`[마이리얼트립] ${e.message}`); 
  }

  // ====================================================================
  // 5. CU 편의점 
  // ====================================================================
  try {
    const CU_URL = 'https://cu.bgfretail.com/brand_info/news_list.do?category=event';
    const { data: cuHtml } = await axios.get(CU_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(cuHtml);
    
    $('.event_list li, .relm_list li, .info_event li, table tbody tr').each((index, element) => {
      const rawTitle = $(element).find('.tit, .txt, .subject, a').first().text().trim();
      const rawDateText = $(element).find('.date, .time, td:nth-child(3)').text().trim() || $(element).text(); 
      const rawLink = $(element).find('a').attr('href');
      
      if (rawTitle && rawTitle.length > 2) {
        const title = `[CU] ${rawTitle}`;
        const extractedDate = extractDate(rawDateText);
        
        addLiveTitle("편의점", "CU", title);
        diagnostics.CU++;

        if (!existingTitles.includes(title) && !isPast(extractedDate)) {
          let finalLink = CU_URL;
          if (rawLink) {
            finalLink = rawLink.startsWith('http') ? rawLink : `https://cu.bgfretail.com${rawLink}`;
          }

          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: finalLink, 
            category: "음식", 
            sub_category: "편의점", 
            author: "AutoBot", 
            mall_name: "CU", 
            status: "진행중", 
            end_date: extractedDate 
          });
        }
      }
    });
  } catch (e: any) { 
    errors.push(`[CU] ${e.message}`); 
  }

  // ====================================================================
  // 6. 도미노피자 
  // ====================================================================
  try {
    const DOMINO_URL = 'https://web.dominos.co.kr/event/list?gubun=E0200';
    const { data: dominoHtml } = await axios.get(DOMINO_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(dominoHtml);
    
    $('.event_list_wrap li, .event-list li, article.event-list li').each((index, element) => {
      const rawTitle = $(element).find('.tit, .subject, strong, p').first().text().trim();
      const rawDateText = $(element).find('.date, .term, p.term').text().trim() || $(element).text();
      const rawLink = $(element).find('a').attr('href');
      
      if (rawTitle && rawTitle.length > 2) {
        const title = `[도미노피자] ${rawTitle}`;
        const extractedDate = extractDate(rawDateText);
        
        addLiveTitle("도미노피자", "도미노피자", title);
        diagnostics.도미노피자++;

        if (!existingTitles.includes(title) && !isPast(extractedDate)) {
          let finalLink = DOMINO_URL;
          if (rawLink) {
            finalLink = `https://web.dominos.co.kr${rawLink}`;
          }

          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: finalLink, 
            category: "음식", 
            sub_category: "도미노피자", 
            author: "AutoBot", 
            mall_name: "도미노피자", 
            status: "진행중", 
            end_date: extractedDate 
          });
        }
      }
    });
  } catch (e: any) { 
    errors.push(`[도미노피자] ${e.message}`); 
  }

  // ====================================================================
  // ✨ 7. 파리바게뜨 (수술: 봇 차단 에러 로깅 추가 및 텍스트 탐색망 보완)
  // ====================================================================
  try {
    const PAST_PARIS_URL = 'https://www.paris.co.kr/promotion/?cat=past';
    const { data: pastParisHtml, status: pastStatus } = await axios.get(PAST_PARIS_URL, { headers: stealthHeaders, validateStatus: () => true });
    
    if (pastStatus !== 200 || pastParisHtml.includes('Cloudflare') || pastParisHtml.includes('Just a moment')) {
        errors.push(`[파리바게뜨 지난프로모션] 접근 막힘 (상태코드: ${pastStatus})`);
    } else {
        const $past = cheerio.load(pastParisHtml);
        const seenPastLinks = new Set();
        
        $past('a').each((index, element) => {
          const link = $past(element).attr('href') || "";
          if (!link || link === '#' || link.includes('cat=') || link.includes('login') || seenPastLinks.has(link)) return;
          
          let rawText = $past(element).text().replace(/\s+/g, ' ').trim();
          $past(element).find('img').each((i, img) => {
              const altText = $past(img).attr('alt');
              if (altText) {
                rawText += " " + altText;
              }
          });
          
          // a 태그 바깥의 부모 텍스트까지 합치되 너무 방대해지지 않도록 방어
          const parentText = $past(element).parent().text().replace(/\s+/g, ' ').trim();
          if (parentText.length < 200) {
              rawText += " " + parentText;
          }

          const hasKeyword = ['혜택', '증정', '천원', '만원', '00원'].some(k => rawText.includes(k));

          if (hasKeyword && rawText.length > 2 && rawText.length < 500) {
            let rawTitle = rawText.replace(/\s+/g, ' ').trim();
            if (rawTitle.length > 45) {
              rawTitle = rawTitle.substring(0, 45) + "..."; 
            }
            if (rawTitle.length > 2) {
              seenPastLinks.add(link);
              pastParisTitles.push(`[파리바게뜨] ${rawTitle}`);
            }
          }
        });
    }
  } catch (e: any) { 
    errors.push(`[파리바게뜨 지난프로모션 에러] ${e.message}`); 
  }

  try {
    const PARIS_URL = 'https://www.paris.co.kr/promotion/';
    const { data: parisHtml, status } = await axios.get(PARIS_URL, { headers: stealthHeaders, validateStatus: () => true });
    
    // 클라우드플레어 차단 여부를 체크하여 에러망에 넘깁니다.
    if (status !== 200 || parisHtml.includes('Cloudflare') || parisHtml.includes('Just a moment')) {
        errors.push(`[파리바게뜨] 봇 접근 막힘 (상태코드: ${status})`);
    } else {
        const $ = cheerio.load(parisHtml);
        const seenLinks = new Set();
        
        $('a').each((index, element) => {
          const link = $(element).attr('href') || "";
          
          if (!link || link === '#' || link.includes('cat=') || link.includes('login') || seenLinks.has(link)) return;
          
          let rawText = $(element).text().replace(/\s+/g, ' ').trim();
          
          $(element).find('img').each((i, img) => {
              const altText = $(img).attr('alt');
              if (altText) {
                rawText += " " + altText;
              }
          });
          
          const parentText = $(element).parent().text().replace(/\s+/g, ' ').trim();
          if (parentText.length < 200) {
              rawText += " " + parentText;
          }

          const hasKeyword = ['혜택', '증정', '천원', '만원', '00원'].some(k => rawText.includes(k));

          if (hasKeyword && rawText.length > 2 && rawText.length < 500) {
            let rawTitle = rawText.replace(/\s+/g, ' ').trim();
            if (rawTitle.length > 45) {
              rawTitle = rawTitle.substring(0, 45) + "..."; 
            }

            if (rawTitle.length > 2) {
              seenLinks.add(link);
              const title = `[파리바게뜨] ${rawTitle}`;
              
              const extractedDate = null;
              
              addLiveTitle("베이커리", "파리바게뜨", title);
              diagnostics.파리바게뜨++;

              if (!existingTitles.includes(title)) {
                let finalLink = PARIS_URL;
                if (link && link.length > 2) {
                  finalLink = link.startsWith('http') ? link : new URL(link, 'https://www.paris.co.kr').href;
                }
                
                scrapedDeals.push({
                  title: title, 
                  content: genericContent, 
                  url: finalLink, 
                  category: "음식", 
                  sub_category: "베이커리", 
                  author: "AutoBot", 
                  mall_name: "파리바게뜨", 
                  status: "진행중", 
                  end_date: extractedDate, 
                });
              }
            }
          }
        });
    }
  } catch (e: any) { 
    errors.push(`[파리바게뜨 에러] ${e.message}`); 
  }

  // ====================================================================
  // 8. DB 저장 및 마감 판정 로직
  // ====================================================================
  let newCount = 0;
  try {
    if (scrapedDeals.length > 0) {
      await supabase.from('deals').insert(scrapedDeals);
      newCount = scrapedDeals.length;
    }
  } catch(e: any) { 
    errors.push(`DB Insert Error: ${e.message}`); 
  }

  try {
    const { data: allDeals } = await supabase.from('deals').select('id, title, end_date, mall_name, sub_category, status');
    
    if (allDeals) {
      const now = new Date();
      now.setHours(0, 0, 0, 0); 
      const todayStr = now.toISOString().split('T')[0];
      
      const toUpdateAsFinished: number[] = [];
      const toStampEndDateAndFinish: number[] = [];
      const toDeleteIds: number[] = [];

      const liveScanTargets = ["트립닷컴", "호텔스닷컴", "마이리얼트립", "네이버페이 쿠폰"];

      allDeals.forEach((deal: any) => {
        let diffDays = 0;
        let hasDate = !!deal.end_date;

        if (hasDate) {
          const endDate = new Date(deal.end_date);
          endDate.setHours(0, 0, 0, 0);
          if (!isNaN(endDate.getTime())) {
            diffDays = (now.getTime() - endDate.getTime()) / (1000 * 3600 * 24);
          }
        }

        if (hasDate && diffDays > 7) { 
          toDeleteIds.push(deal.id); 
          return; 
        }

        if (deal.status === '종료') {
          return;
        }

        let isZombieOrExpired = false;
        let needsDateStamp = false;

        if (deal.mall_name === '파리바게뜨') {
          if (pastParisTitles.includes(deal.title)) {
            isZombieOrExpired = true;
            if (!hasDate) {
              needsDateStamp = true;
            }
          }
        } 
        else if (!liveScanTargets.includes(deal.mall_name) && !liveScanTargets.includes(deal.sub_category)) {
          if (hasDate && diffDays > 0) {
            isZombieOrExpired = true; 
          }
        } 
        else {
          const key = `${deal.sub_category}_${deal.mall_name}`;
          if (liveTitlesBySubAndMall[key] && liveTitlesBySubAndMall[key].length > 0) {
            if (!liveTitlesBySubAndMall[key].includes(deal.title)) {
              isZombieOrExpired = true; 
              if (!hasDate) {
                needsDateStamp = true; 
              }
            }
          }
        }

        if (isZombieOrExpired) {
          if (needsDateStamp) {
            toStampEndDateAndFinish.push(deal.id);
          } else {
            toUpdateAsFinished.push(deal.id);
          }
        }
      });

      if (toDeleteIds.length > 0) {
        await supabase.from('deals').delete().in('id', toDeleteIds);
      }
      
      if (toUpdateAsFinished.length > 0) {
        await supabase.from('deals').update({ status: '종료' }).in('id', toUpdateAsFinished);
      }
      
      if (toStampEndDateAndFinish.length > 0) {
        await supabase.from('deals').update({ 
          status: '종료', 
          end_date: todayStr 
        }).in('id', toStampEndDateAndFinish);
      }
    }
    
    const allScrapedTitles = Object.values(liveTitlesBySubAndMall).flat();
    if (allScrapedTitles.length > 0) {
        await supabase.from('deals').update({ status: '진행중' }).in('title', allScrapedTitles).eq('status', '종료');
    }

  } catch (e: any) { 
    errors.push(`DB Update/Delete Error: ${e.message}`); 
  }

  console.log(`🎉 [크롤러 완료] 새로운 글 ${newCount}개 추가됨.`);
  
  return NextResponse.json({ 
    success: true, 
    new_count: newCount, 
    scraped_breakdown: diagnostics, 
    errors: errors 
  });
}
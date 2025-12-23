// scripts/diagnose-discord-html.js
// Diagnostic tool to analyze Discord HTML export structure

const fs = require('fs');

async function diagnoseHtml() {
  console.log('🔍 Diagnosing Discord HTML export structure...\n');

  const htmlFilePath = process.argv[2];

  if (!htmlFilePath) {
    console.error('❌ Please provide path to Discord HTML file:');
    console.error('   node scripts/diagnose-discord-html.js <path-to-html-file>');
    process.exit(1);
  }

  if (!fs.existsSync(htmlFilePath)) {
    console.error(`❌ File not found: ${htmlFilePath}`);
    process.exit(1);
  }

  try {
    const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
    console.log(`📄 Loaded HTML file: ${Math.round(htmlContent.length / 1024 / 1024)}MB`);
    console.log(`📏 Content length: ${htmlContent.length} characters\n`);

    // Check for common Discord export formats
    console.log('🔎 Checking for common Discord export patterns:\n');

    // DiscordChatExporter format (chatlog__ classes)
    const hasChatlog = htmlContent.includes('chatlog__');
    console.log(`  chatlog__ classes: ${hasChatlog ? '✅ Found' : '❌ Not found'}`);

    if (hasChatlog) {
      const chatlogClasses = [...new Set(htmlContent.match(/chatlog__[\w-]+/g) || [])];
      console.log(`    Classes found: ${chatlogClasses.slice(0, 10).join(', ')}${chatlogClasses.length > 10 ? '...' : ''}`);
    }

    // Alternative formats
    const hasMessageContent = htmlContent.includes('message-content') || htmlContent.includes('messageContent');
    console.log(`  message-content: ${hasMessageContent ? '✅ Found' : '❌ Not found'}`);

    const hasMessageList = htmlContent.includes('messages-') || htmlContent.includes('messageList');
    console.log(`  message list elements: ${hasMessageList ? '✅ Found' : '❌ Not found'}`);

    // Check for "Magic Shopkeeper"
    const hasMagicShopkeeper = htmlContent.includes('Magic Shopkeeper');
    const shopkeeperCount = (htmlContent.match(/Magic Shopkeeper/g) || []).length;
    console.log(`\n  "Magic Shopkeeper": ${hasMagicShopkeeper ? `✅ Found ${shopkeeperCount} times` : '❌ Not found'}`);

    // Check for item mentions (@ pattern)
    const atMentions = htmlContent.match(/@[A-Z][a-z]+(?:\s+\w+)?/g) || [];
    const uniqueMentions = [...new Set(atMentions)].slice(0, 10);
    console.log(`\n  @ mentions: ${atMentions.length > 0 ? `✅ Found ${atMentions.length} mentions` : '❌ Not found'}`);
    if (uniqueMentions.length > 0) {
      console.log(`    Sample mentions: ${uniqueMentions.join(', ')}`);
    }

    // Show sample of HTML structure
    console.log('\n📋 First 2000 characters of HTML:\n');
    console.log('---');
    console.log(htmlContent.substring(0, 2000));
    console.log('---\n');

    // Search for first occurrence of "Magic Shopkeeper" and show context
    if (hasMagicShopkeeper) {
      const shopkeeperIndex = htmlContent.indexOf('Magic Shopkeeper');
      const contextStart = Math.max(0, shopkeeperIndex - 500);
      const contextEnd = Math.min(htmlContent.length, shopkeeperIndex + 1500);
      const context = htmlContent.substring(contextStart, contextEnd);

      console.log('📍 Context around first "Magic Shopkeeper" occurrence:\n');
      console.log('---');
      console.log(context);
      console.log('---\n');
    }

    // Analyze structure by looking for common HTML patterns
    console.log('🏗️  HTML Structure Analysis:\n');

    // Count divs with classes
    const divClasses = [...new Set((htmlContent.match(/<div class="([^"]*)"/g) || []).map(m => m.match(/class="([^"]*)"/)[1]))];
    console.log(`  Unique div classes: ${divClasses.length}`);
    if (divClasses.length > 0) {
      console.log(`    Sample classes: ${divClasses.slice(0, 15).join(', ')}`);
    }

    // Check for timestamp patterns
    const timestampPatterns = [
      { name: 'DD/MM/YYYY H:MM am/pm', regex: /\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}\s+[ap]m/g },
      { name: 'YYYY-MM-DD', regex: /\d{4}-\d{2}-\d{2}/g },
      { name: 'H:MM am/pm', regex: /\d{1,2}:\d{2}\s+[ap]m/g },
    ];

    console.log('\n  Timestamp patterns:');
    for (const pattern of timestampPatterns) {
      const matches = htmlContent.match(pattern.regex) || [];
      if (matches.length > 0) {
        console.log(`    ${pattern.name}: ✅ Found ${matches.length} matches`);
        console.log(`      Sample: ${matches.slice(0, 3).join(', ')}`);
      }
    }

    console.log('\n✅ Diagnosis complete!');
    console.log('\nNext steps:');
    console.log('1. Review the HTML structure above');
    console.log('2. Identify the actual CSS classes and patterns used');
    console.log('3. Update the parser regex patterns to match your Discord export format');

  } catch (error) {
    console.error('❌ Diagnosis failed:', error.message);
    process.exit(1);
  }
}

diagnoseHtml();

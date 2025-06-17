from flask import Flask, request, jsonify, render_template, session, redirect, url_for, make_response
from flask_cors import CORS
from dotenv import load_dotenv
import requests
import os
import json
import hashlib
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
import re
from authlib.integrations.flask_client import OAuth
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:5000", "http://127.0.0.1:5000"])
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-here')
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS

# Initialize OAuth
oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    access_token_url='https://accounts.google.com/o/oauth2/token',
    access_token_params=None,
    authorize_url='https://accounts.google.com/o/oauth2/auth',
    authorize_params=None,
    api_base_url='https://www.googleapis.com/oauth2/v1/',
    client_kwargs={'scope': 'openid email profile'},
)

# Configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
EMAIL_USER = os.getenv('EMAIL_USER')
EMAIL_PASS = os.getenv('EMAIL_PASS')

# File paths for data storage
DATA_DIR = 'data'
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
TRANSACTIONS_FILE = os.path.join(DATA_DIR, 'transactions.json')
BUDGETS_FILE = os.path.join(DATA_DIR, 'budgets.json')
OTP_FILE = os.path.join(DATA_DIR, 'otp_data.json')

# Initialize data files and directory
def init_data_files():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    
    for file_path in [USERS_FILE, TRANSACTIONS_FILE, BUDGETS_FILE, OTP_FILE]:
        if not os.path.exists(file_path):
            with open(file_path, 'w') as f:
                json.dump({}, f)

def load_data(file_path):
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading {file_path}: {e}")
        return {}

def save_data(file_path, data):
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving {file_path}: {e}")
        return False

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def validate_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def generate_otp():
    return str(random.randint(100000, 999999))

def send_otp_email(email, otp):
    try:
        msg = MIMEMultipart()
        msg['From'] = EMAIL_USER
        msg['To'] = email
        msg['Subject'] = "Password Reset OTP - Financial Management System"
        
        body = f"""
        Hello,
        
        Your OTP for password reset is: {otp}
        
        This OTP will expire in 10 minutes.
        
        If you didn't request this, please ignore this email.
        
        Best regards,
        Financial Management System
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASS)
        text = msg.as_string()
        server.sendmail(EMAIL_USER, email, text)
        server.quit()
        return True
    except Exception as e:
        logger.error(f"Email sending failed: {e}")
        return False

@app.route('/')
def index():
    return render_template('index.html')

# Google OAuth routes
@app.route('/google-login')
def google_login():
    redirect_uri = url_for('google_authorize', _external=True)
    return google.authorize_redirect(redirect_uri)

@app.route('/google-authorize')
def google_authorize():
    try:
        token = google.authorize_access_token()
        resp = google.get('userinfo')
        user_info = resp.json()
        
        # Create or retrieve user
        email = user_info['email']
        users = load_data(USERS_FILE)
        
        if email not in users:
            users[email] = {
                'name': user_info.get('name', 'Google User'),
                'email': email,
                'phone': 'Not provided',
                'password': '',  # No password for Google users
                'created_at': datetime.now().isoformat()
            }
            save_data(USERS_FILE, users)
        
        session['user_email'] = email
        session['user_name'] = users[email]['name']
        
        # Return script to close popup and redirect
        return '''
        <script>
            window.opener.postMessage({type: 'google-login-success'}, '*');
            window.close();
        </script>
        '''
    except Exception as e:
        logger.error(f"Google authentication failed: {e}")
        return redirect('/?error=google-auth-failed')

@app.route('/api/check-auth', methods=['GET'])
def check_auth():
    if 'user_email' in session:
        email = session['user_email']
        users = load_data(USERS_FILE)
        user = users.get(email, {})
        return jsonify({
            'authenticated': True,
            'user': {
                'name': session.get('user_name', 'User'),
                'email': email
            }
        })
    return jsonify({'authenticated': False})

@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        email = data.get('email', '').lower().strip()
        password = data.get('password', '')
        name = data.get('name', '').strip()
        phone = data.get('phone', '').strip()
        
        # Validation
        if not all([email, password, name, phone]):
            return jsonify({'success': False, 'message': 'All fields are required'}), 400
        
        if not validate_email(email):
            return jsonify({'success': False, 'message': 'Invalid email format'}), 400
        
        if len(password) < 6:
            return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400
        
        if len(phone) < 10:
            return jsonify({'success': False, 'message': 'Invalid phone number'}), 400
        
        # Check if user exists
        users = load_data(USERS_FILE)
        if email in users:
            return jsonify({'success': False, 'message': 'Email already registered'}), 400
        
        # Create user
        users[email] = {
            'name': name,
            'email': email,
            'phone': phone,
            'password': hash_password(password),
            'created_at': datetime.now().isoformat()
        }
        
        if save_data(USERS_FILE, users):
            session['user_email'] = email
            session['user_name'] = name
            
            return jsonify({
                'success': True, 
                'message': 'Registration successful',
                'user': {
                    'name': name,
                    'email': email
                }
            })
        else:
            return jsonify({'success': False, 'message': 'Failed to save user data'}), 500
        
    except Exception as e:
        logger.error(f"Registration error: {e}")
        return jsonify({'success': False, 'message': 'Server error'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email', '').lower().strip()
        password = data.get('password', '')
        
        if not email or not password:
            return jsonify({'success': False, 'message': 'Email and password required'}), 400
        
        users = load_data(USERS_FILE)
        
        if email not in users:
            return jsonify({'success': False, 'message': 'Invalid email or password'}), 401
        
        if users[email]['password'] != hash_password(password):
            return jsonify({'success': False, 'message': 'Invalid email or password'}), 401
        
        session['user_email'] = email
        session['user_name'] = users[email]['name']
        
        return jsonify({
            'success': True, 
            'message': 'Login successful',
            'user': {
                'name': users[email]['name'],
                'email': email
            }
        })
        
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'success': False, 'message': 'Server error'}), 500

@app.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    try:
        data = request.get_json()
        email = data.get('email', '').lower().strip()
        
        if not email:
            return jsonify({'success': False, 'message': 'Email is required'}), 400
        
        if not validate_email(email):
            return jsonify({'success': False, 'message': 'Invalid email format'}), 400
            
        users = load_data(USERS_FILE)
        
        if email not in users:
            return jsonify({'success': False, 'message': 'Email not found'}), 404
        
        # Generate OTP
        otp = generate_otp()
        otp_data = load_data(OTP_FILE)
        
        otp_data[email] = {
            'otp': otp,
            'expires_at': (datetime.now() + timedelta(minutes=10)).isoformat(),
            'phone': users[email]['phone']
        }
        
        if not save_data(OTP_FILE, otp_data):
            return jsonify({'success': False, 'message': 'Failed to save OTP data'}), 500
        
        # Send OTP via email
        if send_otp_email(email, otp):
            return jsonify({
                'success': True, 
                'message': 'OTP sent to your email',
                'phone': users[email]['phone'][-4:]  # Show last 4 digits
            })
        else:
            return jsonify({'success': False, 'message': 'Failed to send OTP'}), 500
        
    except Exception as e:
        logger.error(f"Forgot password error: {e}")
        return jsonify({'success': False, 'message': 'Server error'}), 500

@app.route('/api/verify-otp', methods=['POST'])
def verify_otp():
    try:
        data = request.get_json()
        email = data.get('email', '').lower().strip()
        otp = data.get('otp', '')
        new_password = data.get('new_password', '')
        
        if not all([email, otp, new_password]):
            return jsonify({'success': False, 'message': 'All fields are required'}), 400
        
        if len(new_password) < 6:
            return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400
        
        otp_data = load_data(OTP_FILE)
        
        if email not in otp_data:
            return jsonify({'success': False, 'message': 'No OTP found for this email'}), 404
        
        # Check OTP expiry
        expires_at = datetime.fromisoformat(otp_data[email]['expires_at'])
        if datetime.now() > expires_at:
            del otp_data[email]
            save_data(OTP_FILE, otp_data)
            return jsonify({'success': False, 'message': 'OTP has expired'}), 400
        
        # Verify OTP
        if otp_data[email]['otp'] != otp:
            return jsonify({'success': False, 'message': 'Invalid OTP'}), 400
        
        # Update password
        users = load_data(USERS_FILE)
        users[email]['password'] = hash_password(new_password)
        
        if not save_data(USERS_FILE, users):
            return jsonify({'success': False, 'message': 'Failed to update password'}), 500
        
        # Clear OTP
        del otp_data[email]
        save_data(OTP_FILE, otp_data)
        
        return jsonify({'success': True, 'message': 'Password reset successful'})
        
    except Exception as e:
        logger.error(f"OTP verification error: {e}")
        return jsonify({'success': False, 'message': 'Server error'}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    try:
        session.clear()
        response = make_response(jsonify({'success': True, 'message': 'Logged out successfully'}))
        response.set_cookie('session', '', expires=0)
        return response
    except Exception as e:
        logger.error(f"Logout error: {e}")
        return jsonify({'success': False, 'message': 'Logout failed'}), 500

def require_login():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Please login first'}), 401
    return None

@app.route('/api/transactions', methods=['GET', 'POST'])
def handle_transactions():
    auth_check = require_login()
    if auth_check:
        return auth_check
    
    user_email = session['user_email']
    all_transactions = load_data(TRANSACTIONS_FILE)
    user_transactions = all_transactions.get(user_email, [])
    
    if request.method == 'GET':
        return jsonify(user_transactions)
    
    data = request.get_json()
    try:
        amount = abs(float(data.get('amount', 0)))
        if amount <= 0:
            return jsonify({'success': False, 'message': 'Invalid amount'}), 400
        
        transaction = {
            'id': len(user_transactions) + 1,
            'type': data.get('type'),
            'amount': amount,
            'category': data.get('category'),
            'description': data.get('description'),
            'date': data.get('date', datetime.now().strftime('%Y-%m-%d'))
        }
        
        user_transactions.append(transaction)
        all_transactions[user_email] = user_transactions
        
        if save_data(TRANSACTIONS_FILE, all_transactions):
            return jsonify(transaction), 201
        else:
            return jsonify({'success': False, 'message': 'Failed to save transaction'}), 500
    except Exception as e:
        logger.error(f"Transaction error: {e}")
        return jsonify({'success': False, 'message': 'Invalid transaction data'}), 400

@app.route('/api/transactions/<int:transaction_id>', methods=['DELETE'])
def delete_transaction(transaction_id):
    auth_check = require_login()
    if auth_check:
        return auth_check
    
    user_email = session['user_email']
    all_transactions = load_data(TRANSACTIONS_FILE)
    user_transactions = all_transactions.get(user_email, [])
    
    initial_count = len(user_transactions)
    user_transactions = [t for t in user_transactions if t.get('id') != transaction_id]
    
    if len(user_transactions) == initial_count:
        return jsonify({'success': False, 'message': 'Transaction not found'}), 404
    
    all_transactions[user_email] = user_transactions
    
    if save_data(TRANSACTIONS_FILE, all_transactions):
        return jsonify({'success': True, 'message': 'Transaction deleted successfully'}), 200
    else:
        return jsonify({'success': False, 'message': 'Failed to delete transaction'}), 500

@app.route('/api/budgets', methods=['GET', 'POST'])
def handle_budgets():
    auth_check = require_login()
    if auth_check:
        return auth_check
    
    user_email = session['user_email']
    all_budgets = load_data(BUDGETS_FILE)
    user_budgets = all_budgets.get(user_email, [])
    
    if request.method == 'GET':
        return jsonify(user_budgets)
    
    data = request.get_json()
    try:
        limit = float(data.get('limit', 0))
        if limit <= 0:
            return jsonify({'success': False, 'message': 'Invalid budget limit'}), 400
        
        budget = {
            'id': len(user_budgets) + 1,
            'category': data.get('category'),
            'limit': limit,
            'month': data.get('month', datetime.now().strftime('%Y-%m'))
        }
        
        user_budgets.append(budget)
        all_budgets[user_email] = user_budgets
        
        if save_data(BUDGETS_FILE, all_budgets):
            return jsonify(budget), 201
        else:
            return jsonify({'success': False, 'message': 'Failed to save budget'}), 500
    except Exception as e:
        logger.error(f"Budget error: {e}")
        return jsonify({'success': False, 'message': 'Invalid budget data'}), 400

@app.route('/api/budgets/<int:budget_id>', methods=['DELETE'])
def delete_budget(budget_id):
    auth_check = require_login()
    if auth_check:
        return auth_check
    
    user_email = session['user_email']
    all_budgets = load_data(BUDGETS_FILE)
    user_budgets = all_budgets.get(user_email, [])
    
    initial_count = len(user_budgets)
    user_budgets = [b for b in user_budgets if b.get('id') != budget_id]
    
    if len(user_budgets) == initial_count:
        return jsonify({'success': False, 'message': 'Budget not found'}), 404
    
    all_budgets[user_email] = user_budgets
    
    if save_data(BUDGETS_FILE, all_budgets):
        return jsonify({'success': True, 'message': 'Budget deleted successfully'}), 200
    else:
        return jsonify({'success': False, 'message': 'Failed to delete budget'}), 500

@app.route('/api/summary', methods=['GET'])
def get_summary():
    auth_check = require_login()
    if auth_check:
        return auth_check
    
    user_email = session['user_email']
    all_transactions = load_data(TRANSACTIONS_FILE)
    user_transactions = all_transactions.get(user_email, [])
    
    try:
        income = sum(t['amount'] for t in user_transactions if t['type'] == 'income')
        expenses = sum(t['amount'] for t in user_transactions if t['type'] == 'expense')
        balance = income - expenses
        
        return jsonify({
            'success': True,
            'income': income,
            'expenses': expenses,
            'balance': balance,
            'transaction_count': len(user_transactions)
        })
    except Exception as e:
        logger.error(f"Summary error: {e}")
        return jsonify({'success': False, 'message': 'Error calculating summary'}), 500

@app.route('/api/financial-advice', methods=['POST'])
def get_financial_advice():
    auth_check = require_login()
    if auth_check:
        return auth_check
    
    try:
        data = request.get_json()
        user_query = data.get('query', '')
        
        if not user_query.strip():
            return jsonify({'success': False, 'message': 'Please enter a question'}), 400
        
        # Get user's financial summary
        user_email = session['user_email']
        all_transactions = load_data(TRANSACTIONS_FILE)
        user_transactions = all_transactions.get(user_email, [])
        
        income = sum(t['amount'] for t in user_transactions if t['type'] == 'income')
        expenses = sum(t['amount'] for t in user_transactions if t['type'] == 'expense')
        balance = income - expenses
        
        # Get budget data
        all_budgets = load_data(BUDGETS_FILE)
        user_budgets = all_budgets.get(user_email, [])
        
        # Create budget summary
        budget_summary = {}
        for budget in user_budgets:
            category = budget['category']
            month = budget['month']
            key = f"{category}-{month}"
            
            if key not in budget_summary:
                spent = sum(t['amount'] for t in user_transactions 
                           if t['type'] == 'expense' and 
                           t['category'] == category and 
                           t['date'].startswith(month))
                
                budget_summary[key] = {
                    'category': category,
                    'month': month,
                    'limit': budget['limit'],
                    'spent': spent,
                    'remaining': budget['limit'] - spent
                }
        
        # Format budget summary as string
        budget_text = "\n".join(
            [f"{item['category']} ({item['month']}): Limit ${item['limit']:.2f}, Spent ${item['spent']:.2f}, Remaining ${item['remaining']:.2f}" 
             for item in budget_summary.values()]
        )
        
        context = f"""
        User's Financial Summary:
        - Total Income: ${income:.2f}
        - Total Expenses: ${expenses:.2f}
        - Current Balance: ${balance:.2f}
        - Number of Transactions: {len(user_transactions)}
        
        Budget Summary:
        {budget_text if budget_text else 'No budgets created'}
        
        User Question: {user_query}
        
        Please provide helpful, practical financial advice based on their situation.
        Break down complex concepts into simple terms. Always suggest concrete steps.
        Keep the response concise and actionable (500-700 characters).
        """
        
        advice = get_ai_response(context)
        
        return jsonify({
            'success': True,
            'advice': advice
        })
        
    except Exception as e:
        logger.error(f"Financial advice error: {e}")
        return jsonify({
            'success': False, 
            'message': 'Sorry, I could not provide advice at the moment. Please try again later.'
        }), 500

@app.route('/api/reports', methods=['GET'])
def get_reports():
    auth_check = require_login()
    if auth_check:
        return auth_check
    
    user_email = session['user_email']
    all_transactions = load_data(TRANSACTIONS_FILE)
    user_transactions = all_transactions.get(user_email, [])
    
    try:
        # Calculate category spending
        categories = {}
        for t in user_transactions:
            if t['type'] == 'expense':
                category = t['category']
                categories[category] = categories.get(category, 0) + t['amount']
        
        # Calculate monthly trends
        monthly_trend = {}
        for t in user_transactions:
            month = t['date'][:7]  # YYYY-MM format
            if month not in monthly_trend:
                monthly_trend[month] = {'income': 0, 'expenses': 0}
            
            if t['type'] == 'income':
                monthly_trend[month]['income'] += t['amount']
            else:
                monthly_trend[month]['expenses'] += t['amount']
        
        # Get the last 6 months
        last_6_months = []
        current_date = datetime.now()
        for i in range(6):
            month = current_date - timedelta(days=30*i)
            month_str = month.strftime('%Y-%m')
            last_6_months.append(month_str)
        last_6_months.reverse()
        
        # Fill missing months
        complete_monthly_trend = {}
        for month in last_6_months:
            complete_monthly_trend[month] = monthly_trend.get(month, {'income': 0, 'expenses': 0})
        
        return jsonify({
            'success': True,
            'income': sum(t['amount'] for t in user_transactions if t['type'] == 'income'),
            'expenses': sum(t['amount'] for t in user_transactions if t['type'] == 'expense'),
            'categories': categories,
            'monthly_trend': complete_monthly_trend
        })
    except Exception as e:
        logger.error(f"Reports error: {e}")
        return jsonify({'success': False, 'message': 'Error generating reports'}), 500

def get_ai_response(prompt):
    try:
        if not GROQ_API_KEY:
            return "AI advice is currently unavailable. Please configure the API key."
        
        headers = {
            'Authorization': f'Bearer {GROQ_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'messages': [
                {
                    'role': 'system', 
                    'content': 'You are a certified financial advisor. Provide specific, actionable advice based on the user transaction history. Break down complex concepts into simple terms. Always suggest concrete steps. Keep response under 500 characters.'
                },
                {'role': 'user', 'content': prompt}
            ],
            'model': 'gemma2-9b-it',
            'max_tokens': 500,
            'temperature': 0.7,
            'top_p': 0.9
        }
        
        response = requests.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            return result['choices'][0]['message']['content']
        else:
            logger.error(f"Groq API error: {response.status_code}, {response.text}")
            return "I'm having trouble connecting to provide advice right now. Please try again in a moment."
            
    except Exception as e:
        logger.error(f"AI response error: {e}")
        return "I'm having trouble connecting to provide advice right now. Please try again in a moment."

if __name__ == '__main__':
    init_data_files()
    app.run(debug=True, port=5000)
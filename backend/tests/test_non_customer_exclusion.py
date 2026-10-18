from backend.models.database import Base, User, ExcludedEmail
from backend.api.auth_routes import is_email_internal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def test_non_customer_exclusion_model():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine, tables=[User.__table__, ExcludedEmail.__table__])
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        # 1. Test ExcludedEmail creation
        test_email = "testdev@gapirai.uz"
        ex = ExcludedEmail(email=test_email, reason="Developer account")
        db.add(ex)
        db.commit()

        # 2. Test is_email_internal helper
        assert is_email_internal(db, test_email) is True
        assert is_email_internal(db, "TESTDEV@GAPIRAI.UZ") is True
        assert is_email_internal(db, "other@gapirai.uz") is False
        assert is_email_internal(db, None) is False

        # 3. Test User is_internal attribute
        u1 = User(email=test_email, name="Dev", is_internal=True)
        u2 = User(email="customer@gmail.com", name="Real Customer", is_internal=False)
        db.add_all([u1, u2])
        db.commit()

        assert u1.is_internal is True
        assert u2.is_internal is False

        # 4. Count real customers vs internal users
        real_count = db.query(User).filter(User.is_internal.is_(False)).count()
        internal_count = db.query(User).filter(User.is_internal.is_(True)).count()
        assert real_count == 1
        assert internal_count == 1
    finally:
        db.close()

if __name__ == "__main__":
    test_non_customer_exclusion_model()
    print("ALL TESTS PASSED!")

